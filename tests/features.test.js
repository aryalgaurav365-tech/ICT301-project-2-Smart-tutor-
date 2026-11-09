import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { database, migrate, now } from "../apps/api/src/db.js";
import { createApp, jobs } from "../apps/api/src/app.js";
import { seed } from "../apps/api/src/seed.js";
let db, server, base, dir;
const cookies = {};
async function call(url, { role, method = "GET", body } = {}) {
  return fetch(base + url, {
    method,
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(role ? { Cookie: cookies[role] } : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
}
async function login(name) {
  await call("/auth/login", {
    method: "POST",
    body: { email: name + "@smarttutor.test", password: "LearnTogether!26" },
  });
  const m = await db("mail")
    .where({ recipient: name + "@smarttutor.test" })
    .orderBy("id", "desc")
    .first();
  const r = await call("/auth/otp", {
    method: "POST",
    body: {
      email: name + "@smarttutor.test",
      code: m.body.match(/\b\d{6}\b/)[0],
    },
  });
  assert.equal(r.status, 200);
  cookies[name] = r.headers.get("set-cookie").split(";")[0];
}
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "smarttutor-features-"));
  db = database(":memory:");
  await migrate(db);
  await migrate(db);
  await seed(db);
  server = createApp(db, { dataDir: dir }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  await login("admin");
  await login("alex");
  await login("elena");
  await login("marcus");
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.destroy();
  await rm(dir, { recursive: true, force: true });
});
test("profile edits persist without permitting role or email escalation", async () => {
  let r = await call("/profile", { role: "alex" });
  const p = await r.json();
  const subject = (await db("subjects").first()).id;
  r = await call("/profile", {
    role: "alex",
    method: "PATCH",
    body: {
      name: "Alex Learner",
      bio: "Testing a profile",
      timezone: "Australia/Sydney",
      subjects: [subject],
      role: "admin",
      email: "changed@example.test",
    },
  });
  assert.equal(r.status, 200);
  const u = await db("users").where({ id: p.id }).first();
  assert.equal(u.name, "Alex Learner");
  assert.equal(u.role, "student");
  assert.equal(u.email, "alex@smarttutor.test");
  assert.equal(
    (
      await call("/profile", {
        role: "alex",
        method: "PATCH",
        body: { name: "Alex", timezone: "Bad/Zone", subjects: [subject] },
      })
    ).status,
    400,
  );
});
test("real profile images are validated and rewritten before public tutor delivery", async () => {
  const form = new FormData();
  form.append(
    "file",
    new Blob(
      [
        await sharp({
          create: { width: 20, height: 20, channels: 3, background: "#155c50" },
        })
          .png()
          .toBuffer(),
      ],
      { type: "image/png" },
    ),
    "photo.png",
  );
  assert.equal(
    (
      await call("/profile/photo", {
        role: "elena",
        method: "POST",
        body: form,
      })
    ).status,
    200,
  );
  const u = await db("users").where({ username: "elena" }).first();
  const r = await call("/users/" + u.id + "/photo");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/webp");
  const metadata = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
  assert.equal(metadata.width, 400);
  const bad = new FormData();
  bad.append(
    "file",
    new Blob(["<svg/>"], { type: "image/svg+xml" }),
    "photo.svg",
  );
  assert.equal(
    (await call("/profile/photo", { role: "elena", method: "POST", body: bad }))
      .status,
    400,
  );
});
test("admin invitations require recent authentication, match an email, expire and are single-use", async () => {
  await db("auth_sessions").update({
    recent_until: "2000-01-01T00:00:00.000Z",
  });
  assert.equal(
    (
      await call("/admin/invites", {
        role: "admin",
        method: "POST",
        body: { email: "newadmin@example.test" },
      })
    ).status,
    428,
  );
  assert.equal(
    (
      await call("/auth/reauth", {
        role: "admin",
        method: "POST",
        body: { password: "wrong" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("/auth/reauth", {
        role: "admin",
        method: "POST",
        body: { password: "LearnTogether!26" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/admin/invites", {
        role: "admin",
        method: "POST",
        body: { email: "newadmin@example.test" },
      })
    ).status,
    201,
  );
  const message = await db("mail")
    .where({ recipient: "newadmin@example.test" })
    .first();
  const invite = message.body.match(/[a-f0-9]{64}/)[0],
    sid = (await db("subjects").first()).id;
  const body = {
    name: "New Admin",
    username: "newadmin",
    email: "wrong@example.test",
    password: "LongPassword!123",
    role: "admin",
    subjects: [sid],
    terms: true,
    invite,
  };
  assert.equal(
    (await call("/auth/register", { method: "POST", body })).status,
    403,
  );
  body.email = "newadmin@example.test";
  assert.equal(
    (await call("/auth/register", { method: "POST", body })).status,
    201,
  );
  assert.ok((await db("admin_invites").first()).used_at);
  await db("users")
    .where({ email: body.email })
    .update({ email: "renamed@example.test", username: "renamed" });
  assert.equal(
    (await call("/auth/register", { method: "POST", body })).status,
    403,
  );
});
test("only owners may change drafts and publishing closes tutor editing", async () => {
  const sid = (await db("subjects").first()).id;
  let r = await call("/tutorials", {
    role: "elena",
    method: "POST",
    body: {
      title: "A draft",
      description: "Draft description",
      difficulty: "Beginner",
      subject_id: sid,
      type: "link",
      url: "https://example.com/lesson",
      status: "draft",
    },
  });
  const draft = await r.json();
  const body = {
    title: "Edited draft",
    description: "Updated description",
    difficulty: "Intermediate",
    subject_id: sid,
    status: "draft",
  };
  assert.equal(
    (
      await call("/my/tutorials/" + draft.id, {
        role: "marcus",
        method: "PATCH",
        body,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/my/tutorials/" + draft.id, {
        role: "elena",
        method: "PATCH",
        body,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/my/tutorials/" + draft.id, {
        role: "elena",
        method: "PATCH",
        body: { ...body, status: "published" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/my/tutorials/" + draft.id, {
        role: "elena",
        method: "PATCH",
        body,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/my/tutorials/" + draft.id, {
        role: "elena",
        method: "DELETE",
      })
    ).status,
    403,
  );
});
test("PDF uploads enforce signature and private authenticated downloads", async () => {
  const sid = (await db("subjects").first()).id;
  const form = new FormData();
  for (const [key, value] of Object.entries({
    title: "A PDF",
    description: "Private PDF",
    difficulty: "Beginner",
    subject_id: sid,
    status: "published",
  }))
    form.append(key, String(value));
  form.append(
    "file",
    new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }),
    "lesson.pdf",
  );
  const r = await call("/tutorials/pdf", {
    role: "elena",
    method: "POST",
    body: form,
  });
  assert.equal(r.status, 201);
  const { id } = await r.json();
  assert.equal((await call("/tutorials/" + id + "/open")).status, 401);
  const download = await call("/tutorials/" + id + "/open", { role: "alex" });
  assert.equal(download.status, 200);
  assert.ok((await download.text()).startsWith("%PDF-"));
});
test("rescheduling requires admin approval and prevents conflicts", async () => {
  const student = await db("users").where({ username: "alex" }).first(),
    tutor = await db("users").where({ username: "elena" }).first(),
    sid = (await db("user_subjects").where({ user_id: tutor.id }).first())
      .subject_id,
    windows = await db("availability")
      .where({ tutor_id: tutor.id })
      .orderBy("starts_at");
  const [request_id] = await db("requests").insert({
    student_id: student.id,
    tutor_id: tutor.id,
    subject_id: sid,
    starts_at: windows[0].starts_at,
    duration: 60,
    notes: "Test",
    created_at: now(),
  });
  const assigned = await call("/requests/" + request_id + "/assign", {
    role: "admin",
    method: "POST",
  });
  assert.equal(assigned.status, 201);
  const session = await assigned.json();
  let r = await call("/session-changes", {
    role: "alex",
    method: "POST",
    body: {
      session_id: session.id,
      kind: "reschedule",
      reason: "A timetable clash",
      starts_at: windows[1].starts_at,
    },
  });
  assert.equal(r.status, 201);
  assert.equal(
    (await db("sessions").where({ id: session.id }).first()).starts_at,
    windows[0].starts_at,
  );
  const change = await db("session_changes").first();
  assert.equal(
    (
      await call("/session-changes/" + change.id + "/resolve", {
        role: "alex",
        method: "POST",
        body: { approve: true, resolution: "Trying to approve myself" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/session-changes/" + change.id + "/resolve", {
        role: "admin",
        method: "POST",
        body: { approve: true, resolution: "New time confirmed" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await db("sessions").where({ id: session.id }).first()).starts_at,
    windows[1].starts_at,
  );
  const [other] = await db("sessions").insert({
    student_id: student.id,
    tutor_id: tutor.id,
    subject_id: sid,
    starts_at: windows[2].starts_at,
    ends_at: new Date(+new Date(windows[2].starts_at) + 3600000).toISOString(),
    status: "scheduled",
    created_at: now(),
  });
  await call("/session-changes", {
    role: "alex",
    method: "POST",
    body: {
      session_id: session.id,
      kind: "reschedule",
      reason: "Another time",
      starts_at: windows[2].starts_at,
    },
  });
  const conflict = await db("session_changes").orderBy("id", "desc").first();
  assert.equal(
    (
      await call("/session-changes/" + conflict.id + "/resolve", {
        role: "admin",
        method: "POST",
        body: { approve: true, resolution: "Conflicting time" },
      })
    ).status,
    409,
  );
  assert.equal(
    (await db("session_changes").where({ id: conflict.id }).first()).status,
    "pending",
  );
});
test("analytics enforce own-data visibility and return counts from records", async () => {
  const admin = await call("/analytics", { role: "admin" }).then((r) =>
      r.json(),
    ),
    student = await call("/analytics", { role: "alex" }).then((r) => r.json());
  assert.ok(admin.days.length > 0);
  assert.ok(student.days.every((d) => Number.isInteger(d.sessions)));
  assert.ok(
    admin.days.reduce((s, d) => s + d.logins, 0) >=
      student.days.reduce((s, d) => s + d.logins, 0),
  );
  assert.equal(
    (await call("/analytics?from=2000-01-01&to=2026-01-01", { role: "alex" }))
      .status,
    400,
  );
});
test("mail leases prevent two workers claiming one delivery, with bounded failure retries", async () => {
  await db("mail").del();
  await db("mail").insert({
    recipient: "test@example.test",
    subject: "Concurrency",
    body: "Hello",
    job_key: "concurrent-mail",
    created_at: now(),
  });
  let sent = 0;
  const transport = {
    sendMail: async () => {
      sent++;
      await new Promise((r) => setTimeout(r, 20));
    },
  };
  await Promise.all([jobs(db, { transport }), jobs(db, { transport })]);
  assert.equal(sent, 1);
  assert.equal(
    (await db("mail").where({ job_key: "concurrent-mail" }).first()).status,
    "sent",
  );
  await db("mail").insert({
    recipient: "fail@example.test",
    subject: "Failure",
    body: "Hello",
    job_key: "failed-mail",
    attempts: 4,
    created_at: now(),
  });
  const diagnostics = [];
  await jobs(db, {
    logger: { error: (...args) => diagnostics.push(args) },
    transport: {
      sendMail: async () => {
        throw Object.assign(new Error("secret-password-and-invitation"), {
          code: "EAUTH",
          responseCode: 535,
          response: "secret-provider-response",
          command: "AUTH secret-login",
        });
      },
    },
  });
  assert.deepEqual(diagnostics[0], [
    "Mail delivery failed",
    {
      mailId: (await db("mail").where({ job_key: "failed-mail" }).first()).id,
      attempt: 5,
      code: "EAUTH",
      smtpStatus: 535,
    },
  ]);
  assert.equal(JSON.stringify(diagnostics).includes("secret-"), false);
  assert.equal(
    (await db("mail").where({ job_key: "failed-mail" }).first()).status,
    "failed",
  );
  assert.equal(
    (await call("/admin/mail", { role: "admin" }).then((r) => r.json())).some(
      (m) => "body" in m,
    ),
    false,
  );
});

test("admin enrollment queues setup links without exposing a password", async () => {
  const subject = (await db("subjects").first()).id;
  const r = await call("/admin/students", {
    role: "admin",
    method: "POST",
    body: {
      name: "Enrolled Learner",
      username: "enrolledlearner",
      email: "enrolled@example.test",
      dob: "2000-01-01",
      address: "Development-only address",
      subjects: [subject],
    },
  });
  assert.equal(r.status, 201);
  const result = await r.json();
  assert.equal(result.password, undefined);
  const user = await db("users").where({ username: "enrolledlearner" }).first();
  assert.equal(user.role, "student");
  assert.equal(Number(user.verified), 0);
  const messages = await db("mail").where({
    recipient: "enrolled@example.test",
  });
  assert.equal(messages.length, 2);
  assert.ok(messages.some((m) => m.subject.includes("Verify")));
  assert.ok(messages.some((m) => m.subject.includes("password")));
});
