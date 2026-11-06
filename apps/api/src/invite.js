import "./config.js";
import { database, migrate, now } from "./db.js";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
const email = z.email().parse(process.argv[2]).toLowerCase(),
  db = database();
try {
  await migrate(db);
  if (await db("users").where({ role: "admin" }).first())
    throw new Error(
      "An administrator exists. Use the signed-in admin invitation screen.",
    );
  const code = randomBytes(32).toString("hex");
  await db("admin_invites").insert({
    email,
    digest: createHash("sha256").update(code).digest("hex"),
    expires_at: new Date(Date.now() + 48 * 3600000).toISOString(),
  });
  await db("mail").insert({
    recipient: email,
    subject: "Your SmartTutor administrator invitation",
    body: `Register at ${process.env.APP_URL || "http://localhost:5173"}/register with this single-use invitation: ${code}`,
    job_key: randomBytes(32).toString("hex"),
    created_at: now(),
  });
  console.log(
    "Bootstrap invitation queued for the specified email. Configure SMTP or use the local development inbox.",
  );
} finally {
  await db.destroy();
}
