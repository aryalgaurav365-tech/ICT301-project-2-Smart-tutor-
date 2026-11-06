import assert from "node:assert/strict";
import { database, migrate } from "../apps/api/src/db.js";
import { seed } from "../apps/api/src/seed.js";
import { createApp } from "../apps/api/src/app.js";
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_ci")
)
  throw new Error("This test requires a disposable database ending in _ci");
process.env.ALLOW_DEMO_SEED = "true";
const db = database();
let server;
try {
  await migrate(db);
  await migrate(db);
  await seed(db);
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (route, body, cookie) =>
    fetch(base + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  await post("/auth/login", {
    email: "admin@smarttutor.test",
    password: "LearnTogether!26",
  });
  const m = await db("mail")
    .where({ recipient: "admin@smarttutor.test" })
    .orderBy("id", "desc")
    .first();
  const r = await post("/auth/otp", {
    email: "admin@smarttutor.test",
    code: m.body.match(/\b\d{6}\b/)[0],
  });
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie").split(";")[0],
    student = await db("users").where({ username: "alex" }).first(),
    tutor = await db("users").where({ username: "elena" }).first(),
    slot = await db("availability").where({ tutor_id: tutor.id }).first(),
    subject = (await db("user_subjects").where({ user_id: tutor.id }).first())
      .subject_id;
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const [rid] = await db("requests").insert({
      student_id: student.id,
      tutor_id: tutor.id,
      subject_id: subject,
      starts_at: slot.starts_at,
      duration: 60,
      notes: "Concurrent MySQL test",
      created_at: new Date().toISOString(),
    });
    ids.push(rid);
  }
  const outcomes = await Promise.all(
    ids.map((i) =>
      post("/requests/" + i + "/assign", {}, cookie).then((r) => r.status),
    ),
  );
  assert.deepEqual(outcomes.sort(), [201, 409]);
  assert.equal((await db("sessions").where({ status: "scheduled" })).length, 1);
  console.log("MySQL migrations, OTP login and concurrent scheduling passed.");
} finally {
  if (server) await new Promise((r) => server.close(r));
  await db.destroy();
}
