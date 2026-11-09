import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { now } from "./db.js";
export async function bootstrapAdmin(db, env = process.env, logger = console) {
  if (!env.INITIAL_ADMIN_EMAIL) {
    logger.info(
      "Administrator bootstrap disabled: INITIAL_ADMIN_EMAIL is not configured",
    );
    return false;
  }
  const email = z.email().parse(env.INITIAL_ADMIN_EMAIL).toLowerCase();
  if (await db("users").where({ role: "admin" }).first()) {
    logger.info(
      "Administrator bootstrap skipped: an administrator already exists",
    );
    return false;
  }
  if (
    await db("admin_invites")
      .where({ email, used_at: null })
      .where("expires_at", ">", now())
      .first()
  ) {
    const pending = !!(await db("mail")
      .where({
        recipient: email,
        status: "pending",
        subject: "Your SmartTutor administrator invitation",
      })
      .first());
    logger.info(
      pending
        ? "Administrator invitation already queued for delivery"
        : "Administrator invitation exists without pending mail; check delivery status",
    );
    return pending;
  }
  const code = randomBytes(32).toString("hex");
  await db.transaction(async (trx) => {
    await trx("admin_invites").insert({
      email,
      digest: createHash("sha256").update(code).digest("hex"),
      expires_at: new Date(Date.now() + 48 * 3600000).toISOString(),
    });
    await trx("mail").insert({
      recipient: email,
      subject: "Your SmartTutor administrator invitation",
      body: `Register at ${env.APP_URL}/register with your email and this single-use invitation: ${code}`,
      job_key: "bootstrap:" + randomBytes(24).toString("hex"),
      created_at: now(),
    });
  });
  logger.info("Administrator invitation queued for delivery");
  return true;
}
