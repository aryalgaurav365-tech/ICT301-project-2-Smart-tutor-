import { test } from "node:test";
import assert from "node:assert/strict";
import { mailTransport } from "../apps/api/src/mail-transport.js";
import { database, migrate, now } from "../apps/api/src/db.js";
import { jobs } from "../apps/api/src/jobs.js";

const env = {
  BREVO_API_KEY: "synthetic-private-api-key",
  SMTP_HOST: "unused.example.test",
  MAIL_FROM: "SmartTutor <sender@example.test>",
};
const message = {
  from: env.MAIL_FROM,
  to: "learner@example.test",
  subject: "Invitation",
  text: "private-invitation",
};

test("Brevo API takes precedence over SMTP and sends the verified sender and message over HTTPS", async () => {
  let calls = 0;
  const transport = mailTransport(env, async (url, options) => {
    calls++;
    assert.equal(url, "https://api.brevo.com/v3/smtp/email");
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers["api-key"], env.BREVO_API_KEY);
    assert.deepEqual(JSON.parse(options.body), {
      sender: { name: "SmartTutor", email: "sender@example.test" },
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
    });
    return Response.json({ messageId: "provider-message-id" }, { status: 201 });
  });
  const db = database(":memory:");
  try {
    await migrate(db);
    await db("mail").insert({
      recipient: message.to,
      subject: message.subject,
      body: message.text,
      job_key: "brevo-test",
      created_at: now(),
    });
    await jobs(db, { transport, env, logger: { info() {} } });
    const saved = await db("mail").first();
    assert.equal(calls, 1);
    assert.equal(saved.status, "sent");
    assert.equal(saved.body.includes(message.text), false);
  } finally {
    await db.destroy();
  }
  assert.equal(mailTransport({}), null);
  assert.equal(
    typeof mailTransport({ SMTP_HOST: "smtp.example.test" }).sendMail,
    "function",
  );
});

test("Brevo rejections keep mail queued, honor retry delay, and do not expose response contents", async () => {
  const transport = mailTransport(
    env,
    async () =>
      new Response("private-response-with-key-and-message", {
        status: 429,
        headers: { "Retry-After": "180" },
      }),
  );
  const db = database(":memory:");
  const logs = [];
  const at = new Date("2026-11-10T00:00:00Z");
  try {
    await migrate(db);
    await db("mail").insert({
      recipient: message.to,
      subject: message.subject,
      body: message.text,
      job_key: "brevo-retry",
      created_at: at.toISOString(),
    });
    await jobs(db, {
      transport,
      env,
      clock: () => at,
      logger: { error: (...args) => logs.push(args) },
    });
    const saved = await db("mail").first();
    assert.equal(saved.status, "pending");
    assert.equal(saved.attempts, 1);
    assert.equal(saved.next_attempt_at, "2026-11-10T00:03:00.000Z");
    assert.equal(logs[0][1].code, "BREVO_HTTP");
    assert.equal(logs[0][1].httpStatus, 429);
    assert.equal(JSON.stringify(logs).includes("private"), false);
  } finally {
    await db.destroy();
  }
});

test("Brevo fails safely for authentication, malformed responses, invalid sender, and network errors", async () => {
  await assert.rejects(
    mailTransport(
      env,
      async () => new Response("private-key", { status: 401 }),
    ).sendMail(message),
    (error) =>
      error.code === "BREVO_HTTP" &&
      error.httpStatus === 401 &&
      !error.message.includes("private"),
  );
  await assert.rejects(
    mailTransport(env, async () => Response.json({}, { status: 201 })).sendMail(
      message,
    ),
    { code: "BREVO_RESPONSE" },
  );
  await assert.rejects(
    mailTransport(env, async () => {
      throw new Error("private-key");
    }).sendMail(message),
    (error) =>
      error.code === "BREVO_NETWORK" && !error.message.includes("private"),
  );
  await assert.rejects(
    mailTransport(env, async () => {
      throw new Error("must not send");
    }).sendMail({ ...message, from: "invalid" }),
    { code: "EMAIL_ADDRESS_CONFIG" },
  );
});
