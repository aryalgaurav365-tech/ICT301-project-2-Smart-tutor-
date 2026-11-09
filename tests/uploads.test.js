import { test } from "node:test";
import assert from "node:assert/strict";
import { database, migrate, now } from "../apps/api/src/db.js";
import { createApp } from "../apps/api/src/app.js";
import { seed } from "../apps/api/src/seed.js";
test("direct upload tickets preserve ownership, validation, size limits and idempotent completion", async () => {
  const db = database(":memory:");
  await migrate(db);
  await seed(db);
  const staged = [];
  let promoted = 0;
  const fileStore = {
    available: true,
    remote: true,
    stagePdf: async (size) => {
      const key =
        "staging/" + String(staged.length + 1).padStart(48, "0") + ".pdf";
      staged.push(size);
      return { key, url: "https://private.example.test/signed-upload" };
    },
    promotePdf: async () => {
      promoted++;
      return "s3:" + "f".repeat(48) + ".pdf";
    },
    remove: async () => {},
  };
  const server = createApp(db, { fileStore }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const cookie = async (name) => {
    await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: name + "@smarttutor.test",
        password: "LearnTogether!26",
      }),
    });
    const m = await db("mail")
      .where({ recipient: name + "@smarttutor.test" })
      .orderBy("id", "desc")
      .first();
    const r = await fetch(base + "/auth/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: name + "@smarttutor.test",
        code: m.body.match(/\b\d{6}\b/)[0],
      }),
    });
    return r.headers.get("set-cookie").split(";")[0];
  };
  const post = (route, body, c) =>
    fetch(base + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(c ? { Cookie: c } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    const tutor = await cookie("elena"),
      other = await cookie("marcus"),
      student = await cookie("alex"),
      subject = (await db("subjects").first()).id;
    const metadata = {
      title: "20 MB lesson",
      description: "Upload without a function-sized body",
      subject_id: subject,
      difficulty: "Beginner",
      status: "published",
      file_size: 20 * 1024 * 1024,
    };
    assert.equal((await post("/uploads/pdf", metadata)).status, 401);
    assert.equal((await post("/uploads/pdf", metadata, student)).status, 403);
    assert.equal(
      (
        await post(
          "/uploads/pdf",
          { ...metadata, file_size: metadata.file_size + 1 },
          tutor,
        )
      ).status,
      400,
    );
    const response = await post("/uploads/pdf", metadata, tutor);
    assert.equal(response.status, 201);
    const ticket = await response.json();
    assert.equal(staged[0], 20 * 1024 * 1024);
    assert.equal(
      (await post("/uploads/pdf/complete", { ticket: ticket.ticket }, other))
        .status,
      404,
    );
    let r = await post(
      "/uploads/pdf/complete",
      { ticket: ticket.ticket },
      tutor,
    );
    assert.equal(r.status, 201);
    const result = await r.json();
    r = await post("/uploads/pdf/complete", { ticket: ticket.ticket }, tutor);
    assert.equal((await r.json()).id, result.id);
    assert.equal(promoted, 1);
    const resource = await db("tutorials").where({ id: result.id }).first();
    assert.equal(resource.title, metadata.title);
    assert.equal(resource.file, "s3:" + "f".repeat(48) + ".pdf");
    const expired = await post("/uploads/pdf", metadata, tutor).then((r) =>
      r.json(),
    );
    await db("upload_tickets")
      .where({ id: expired.ticket })
      .update({ expires_at: "2000-01-01T00:00:00.000Z" });
    assert.equal(
      (await post("/uploads/pdf/complete", { ticket: expired.ticket }, tutor))
        .status,
      400,
    );
  } finally {
    await new Promise((r) => server.close(r));
    await db.destroy();
  }
});
