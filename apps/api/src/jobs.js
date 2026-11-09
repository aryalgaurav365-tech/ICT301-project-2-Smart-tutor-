import nodemailer from "nodemailer";
import { randomBytes } from "node:crypto";
import { now } from "./db.js";
export async function jobs(
  db,
  {
    transport,
    clock = () => new Date(),
    batchSize = 20,
    deadlineMs = Infinity,
  } = {},
) {
  const deadline = Date.now() + deadlineMs;
  const at = clock().toISOString(),
    next = new Date(+clock() + 24 * 3600000).toISOString();
  const sessions = await db("sessions")
    .where({ status: "scheduled" })
    .where("starts_at", ">", at)
    .where("starts_at", "<=", next);
  for (const s of sessions) {
    // Short-notice bookings already receive confirmation; do not create a past-due reminder.
    if (
      s.created_at >
      new Date(+new Date(s.starts_at) - 24 * 3600000).toISOString()
    )
      continue;
    for (const uid of [s.student_id, s.tutor_id]) {
      const key = `reminder:${s.id}:${uid}:${s.starts_at}`;
      const u = await db("users").where({ id: uid }).first();
      if (!u || u.status !== "active") continue;
      await db("mail")
        .insert({
          recipient: u.email,
          subject: "Your tutoring session is coming up",
          body: `Your session starts ${s.starts_at}. Check your dashboard for details.`,
          job_key: key,
          session_id: s.id,
          session_starts_at: s.starts_at,
          created_at: at,
        })
        .onConflict("job_key")
        .ignore();
    }
  }
  if (!transport && !process.env.SMTP_HOST) return;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === "465",
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  // A crashed worker's lease expires. External SMTP still cannot guarantee exactly-once delivery.
  await db("mail")
    .where({ status: "sending" })
    .where("lease_until", "<", at)
    .update({ status: "pending", lease_token: null, lease_until: null });
  const pending = await db("mail")
    .where({ status: "pending" })
    .where((b) =>
      b.whereNull("next_attempt_at").orWhere("next_attempt_at", "<=", at),
    )
    .orderByRaw("CASE WHEN job_key LIKE 'auth:%' THEN 0 ELSE 1 END")
    .orderBy("id")
    .limit(batchSize);
  for (const m of pending) {
    if (Date.now() + 15000 > deadline) break;
    const lease = randomBytes(24).toString("hex");
    const claimed = await db("mail")
      .where({ id: m.id, status: "pending" })
      .update({
        status: "sending",
        lease_token: lease,
        lease_until: new Date(+clock() + 5 * 60000).toISOString(),
        attempts: m.attempts + 1,
      });
    if (!claimed) continue;
    const owned = () =>
      db("mail").where({ id: m.id, status: "sending", lease_token: lease });
    if (m.session_id) {
      const s = await db("sessions")
        .where({ id: m.session_id, status: "scheduled" })
        .first();
      if (!s || s.starts_at !== m.session_starts_at) {
        await owned().update({
          status: "cancelled",
          lease_token: null,
          lease_until: null,
        });
        continue;
      }
    }
    try {
      await transport.sendMail({
        from: process.env.MAIL_FROM,
        to: m.recipient,
        subject: m.subject,
        text: m.body,
      });
      await owned().update({
        status: "sent",
        body: "[Delivered message content removed]",
        lease_token: null,
        lease_until: null,
      });
    } catch {
      await owned().update({
        status: m.attempts + 1 >= 5 ? "failed" : "pending",
        next_attempt_at: new Date(
          +clock() + Math.min(60, 2 ** m.attempts) * 60000,
        ).toISOString(),
        lease_token: null,
        lease_until: null,
      });
    }
  }
}
