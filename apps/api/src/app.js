import express from "express";
import sharp from "sharp";
import { verifyCaptcha } from "./captcha.js";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt, createHash } from "node:crypto";
import { z } from "zod";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import { spreadsheet } from "./spreadsheet.js";
import { now } from "./db.js";
import { features } from "./features.js";
import { storage } from "./storage.js";
const hash = (s) => createHash("sha256").update(s).digest("hex"),
  token = () => randomBytes(32).toString("hex");
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const text = z.string().trim().min(1).max(5000),
  id = z.coerce.number().int().positive(),
  date = z
    .string()
    .datetime({ offset: true })
    .transform((v) => new Date(v).toISOString()),
  password = z
    .string()
    .min(10)
    .refine(
      (v) => Buffer.byteLength(v) <= 72,
      "Password must be at most 72 bytes",
    );
const safe = (u) => {
  if (!u) return null;
  const { password, ...r } = u;
  return r;
};
export function createApp(
  db,
  {
    production = process.env.NODE_ENV === "production",
    dataDir = path.resolve(process.env.DATA_DIR || "data"),
    fileStore,
    proxyHops = process.env.TRUST_PROXY ?? (process.env.VERCEL ? 1 : 0),
  } = {},
) {
  const app = express();
  const store = fileStore || storage({ dataDir, production, db });
  app.disable("x-powered-by");
  const hops = Number(proxyHops);
  if (!Number.isInteger(hops) || hops < 0)
    throw Object.assign(
      new Error("TRUST_PROXY must be a nonnegative integer"),
      {
        code: "CONFIG_PROXY",
      },
    );
  // Vercel supplies the client address through its upstream proxy. Trust only
  // that hop, not arbitrary entries a client might add to the forwarded chain.
  app.set("trust proxy", hops === 0 ? false : hops);
  app.use(
    helmet({
      contentSecurityPolicy: production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
              styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
              ],
              fontSrc: ["'self'", "https://fonts.gstatic.com"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'", "https://challenges.cloudflare.com"],
              frameSrc: ["https://challenges.cloudflare.com"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
            },
          }
        : false,
    }),
    express.json({ limit: "64kb" }),
    cookieParser(),
  );
  app.use("/api", (req, res, next) => {
    const origins = [
      new URL(process.env.APP_URL || "http://localhost:5173").origin,
      ...(!production
        ? [
            "http://127.0.0.1:5173",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
          ]
        : []),
    ];
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") &&
      !origins.includes(req.get("origin"))
    )
      return res.status(403).json({ error: "Origin not allowed" });
    next();
  });
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 100,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", async (req, res, next) => {
    try {
      const s =
        req.cookies.st_session &&
        (await db("auth_sessions")
          .where({ digest: hash(req.cookies.st_session) })
          .where("expires_at", ">", now())
          .first());
      req.session = s;
      req.user = s
        ? await db("users")
            .where({ id: s.user_id, status: "active", verified: true })
            .first()
        : null;
      next();
    } catch (e) {
      next(e);
    }
  });
  const auth =
    (...roles) =>
    (req, res, next) => {
      if (!req.user)
        return res.status(401).json({ error: "Please sign in to continue" });
      if (roles.length && !roles.includes(req.user.role))
        return res
          .status(403)
          .json({ error: "You do not have permission for this action" });
      if (
        req.user.role === "admin" &&
        roles.includes("admin") &&
        (!req.session?.recent_until || req.session.recent_until < now())
      )
        return res
          .status(428)
          .json({ error: "Confirm your password to continue", reauth: true });
      next();
    };
  const audit = (uid, action) =>
    db("audit").insert({ user_id: uid, action, created_at: now() });
  const notify = (uid, title, body) =>
    db("notifications").insert({
      user_id: uid,
      title,
      body,
      created_at: now(),
    });
  const mail = (recipient, subject, body, key) =>
    db("mail").insert({
      recipient,
      subject,
      body,
      job_key: key || token(),
      created_at: now(),
    });
  async function challenge(u, kind) {
    const code = kind === "otp" ? String(randomInt(100000, 1000000)) : token();
    await db("challenges").where({ user_id: u.id, kind }).del();
    await db("challenges").insert({
      user_id: u.id,
      kind,
      digest: hash(code),
      expires_at: new Date(
        Date.now() + (kind === "otp" ? 10 : 30) * 60000,
      ).toISOString(),
    });
    await db("mail")
      .where({ recipient: u.email, status: "pending" })
      .where("job_key", "like", `auth:${u.id}:${kind}:%`)
      .update({ status: "cancelled" });
    await mail(
      u.email,
      kind === "otp"
        ? "Your SmartTutor sign-in code"
        : kind === "verify"
          ? "Verify your email"
          : "Reset your password",
      kind === "otp"
        ? `Your login code is ${code}. It expires in 10 minutes.`
        : `Open ${process.env.APP_URL || "http://localhost:5173"}/${kind === "verify" ? "verify" : "reset-password"}?token=${code}`,
      `auth:${u.id}:${kind}:${hash(code)}`,
    );
  }
  app.get("/api/health", async (req, res) => {
    await db.raw("select 1");
    res.json({ status: "ok", database: "connected" });
  });
  app.get("/api/config", (req, res) =>
    res.json({
      demo: !production,
      captchaSiteKey: process.env.CAPTCHA_SITE_KEY || null,
      directPdfUploads: store.remote,
      maxResourceFileBytes: store.maxUploadBytes || 3 * 1024 * 1024,
      maxProfilePhotoBytes: process.env.VERCEL
        ? 3 * 1024 * 1024
        : 5 * 1024 * 1024,
    }),
  );
  app.get("/api/auth/me", (req, res) => res.json({ user: safe(req.user) }));
  app.post("/api/auth/register", async (req, res) => {
    const s = z
      .object({
        name: text.max(100),
        username: z.string().regex(/^[a-zA-Z0-9_]{3,40}$/),
        email: z.email().max(200),
        password,
        role: z.enum(["student", "tutor", "admin"]),
        dob: z.string().optional(),
        address: z.string().max(255).optional(),
        bio: z.string().max(3000).optional(),
        qualifications: z.string().max(3000).optional(),
        subjects: z.array(id).min(1),
        terms: z.literal(true),
        invite: z.string().optional(),
        captcha: z.string().optional(),
      })
      .parse(req.body);
    if (
      s.role === "admin" &&
      (!s.invite ||
        !(await db("admin_invites")
          .where({
            digest: hash(s.invite),
            email: s.email.toLowerCase(),
            used_at: null,
          })
          .where("expires_at", ">", now())
          .first()))
    )
      fail(
        403,
        "Administrator registration requires a valid email-bound invitation",
      );
    if (s.role === "student" && (!s.dob || !s.address))
      fail(400, "Date of birth and home address are required");
    if (s.role === "tutor" && !s.qualifications)
      fail(400, "Qualifications are required");
    if (production) await verifyCaptcha(s.captcha);
    if (
      await db("users")
        .where({ email: s.email.toLowerCase() })
        .orWhere({ username: s.username })
        .first()
    )
      fail(409, "Email or username already registered");
    const pw = await bcrypt.hash(s.password, 12);
    const uid = await db.transaction(async (trx) => {
      if (s.role === "admin") {
        const n = await trx("admin_invites")
          .where({
            digest: hash(s.invite),
            email: s.email.toLowerCase(),
            used_at: null,
          })
          .where("expires_at", ">", now())
          .update({ used_at: now() });
        if (!n) fail(403, "Invitation expired or already used");
      }
      const [uid] = await trx("users").insert({
        name: s.name,
        username: s.username,
        email: s.email.toLowerCase(),
        password: pw,
        role: s.role,
        status: s.role === "tutor" ? "pending" : "active",
        dob: s.dob,
        address: s.address,
        bio: s.bio,
        qualifications: s.qualifications,
        created_at: now(),
      });
      for (const subject_id of [...new Set(s.subjects)])
        await trx("user_subjects").insert({ user_id: uid, subject_id });
      return uid;
    });
    await challenge(await db("users").where({ id: uid }).first(), "verify");
    res.status(201).json({
      message:
        "Check your email to verify your account. Tutors also need administrator approval.",
    });
  });
  app.post("/api/auth/verify", async (req, res) => {
    const { token: code } = z.object({ token: text }).parse(req.body);
    const uid = await db.transaction(async (trx) => {
      const c = await trx("challenges")
        .where({ kind: "verify", digest: hash(code) })
        .where("expires_at", ">", now())
        .first();
      if (!c) fail(400, "Invalid or expired verification link");
      await trx("users").where({ id: c.user_id }).update({ verified: true });
      await trx("challenges").where({ id: c.id }).del();
      return c.user_id;
    });
    const user = await db("users").where({ id: uid }).first();
    await mail(
      user.email,
      "Welcome to SmartTutor",
      "Your email is verified. Your next chapter starts here. Tutors can sign in after administrator approval.",
    );
    res.json({
      message: "Email verified. Sign in once your account is active.",
    });
  });
  app.post("/api/auth/login", async (req, res) => {
    const s = z.object({ email: z.email(), password: text }).parse(req.body);
    const u = await db("users").where({ email: s.email.toLowerCase() }).first();
    if (!u || !(await bcrypt.compare(s.password, u.password)))
      fail(401, "Email or password is incorrect");
    if (!u.verified) fail(403, "Verify your email before signing in");
    if (u.status !== "active")
      fail(403, `Your account is ${u.status}. Contact the administrator.`);
    await challenge(u, "otp");
    res.json({ message: "A sign-in code has been sent to your email" });
  });
  app.post("/api/auth/otp", async (req, res) => {
    const s = z
      .object({ email: z.email(), code: z.string().regex(/^\d{6}$/) })
      .parse(req.body);
    const u = await db("users")
      .where({ email: s.email.toLowerCase(), verified: true, status: "active" })
      .first();
    if (!u) fail(401, "Invalid code");
    const c = await db("challenges")
      .where({ user_id: u.id, kind: "otp" })
      .where("expires_at", ">", now())
      .first();
    if (!c || c.attempts >= 5)
      fail(401, "Code expired or attempt limit reached. Sign in again.");
    await db("challenges").where({ id: c.id }).increment("attempts", 1);
    if (c.digest !== hash(s.code)) fail(401, "Invalid code");
    if (!(await db("challenges").where({ id: c.id }).del()))
      fail(401, "Code already used");
    const t = token();
    await db("auth_sessions").insert({
      digest: hash(t),
      user_id: u.id,
      expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
      recent_until: new Date(Date.now() + 15 * 60000).toISOString(),
    });
    res.cookie("st_session", t, {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      maxAge: 8 * 3600000,
    });
    await audit(u.id, "login");
    res.json({ user: safe(u) });
  });
  app.post("/api/auth/logout", async (req, res) => {
    if (req.cookies.st_session)
      await db("auth_sessions")
        .where({ digest: hash(req.cookies.st_session) })
        .del();
    res.clearCookie("st_session");
    res.json({ message: "Signed out" });
  });
  app.post("/api/auth/forgot", async (req, res) => {
    const { email } = z.object({ email: z.email() }).parse(req.body);
    const u = await db("users").where({ email: email.toLowerCase() }).first();
    if (u) await challenge(u, "reset");
    res.json({ message: "If the account exists, a reset link has been sent." });
  });
  app.post("/api/auth/reset", async (req, res) => {
    const s = z.object({ token: text, password }).parse(req.body);
    const c = await db("challenges")
      .where({ kind: "reset", digest: hash(s.token) })
      .where("expires_at", ">", now())
      .first();
    if (!c) fail(400, "Invalid or expired reset link");
    const pw = await bcrypt.hash(s.password, 12);
    await db.transaction(async (trx) => {
      if (!(await trx("challenges").where({ id: c.id }).del()))
        fail(400, "Reset link already used");
      await trx("users").where({ id: c.user_id }).update({ password: pw });
      await trx("auth_sessions").where({ user_id: c.user_id }).del();
    });
    res.json({ message: "Password updated. Sign in with your new password." });
  });
  app.get("/api/subjects", async (req, res) =>
    res.json(await db("subjects").orderBy("name")),
  );
  app.get("/api/tutors", async (req, res) => {
    const tutors = await db("users")
      .where({ role: "tutor", status: "active", verified: true })
      .select("id", "name", "bio", "qualifications", "photo");
    for (const t of tutors) {
      t.subjects = await db("user_subjects")
        .join("subjects", "subjects.id", "user_subjects.subject_id")
        .where({ user_id: t.id })
        .select("subjects.*");
      t.reviews = await db("reviews")
        .join("users", "users.id", "reviews.student_id")
        .where({ tutor_id: t.id })
        .select("reviews.*", "users.name");
      t.rating = t.reviews.length
        ? t.reviews.reduce((sum, r) => sum + r.rating, 0) / t.reviews.length
        : null;
      t.availability = await db("availability")
        .where({ tutor_id: t.id })
        .where("ends_at", ">", now())
        .orderBy("starts_at");
    }
    res.json(tutors);
  });
  app.get("/api/tutorials", async (req, res) => {
    let q = db("tutorials")
      .join("users", "users.id", "tutorials.tutor_id")
      .join("subjects", "subjects.id", "tutorials.subject_id")
      .select(
        "tutorials.*",
        "users.name as tutor_name",
        "subjects.name as subject",
        "subjects.color",
      );
    if (req.user?.role !== "admin")
      q = q.where("tutorials.status", "published");
    const rows = await q.orderBy("tutorials.created_at", "desc");
    const ratings = await db("reviews")
      .select("tutor_id")
      .avg({ rating: "rating" })
      .groupBy("tutor_id");
    for (const row of rows)
      row.tutor_rating =
        ratings.find((r) => r.tutor_id === row.tutor_id)?.rating || null;
    res.json(rows);
  });
  const tutorialSchema = z.object({
    title: text.max(255),
    description: text,
    subject_id: id,
    difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
    status: z.enum(["draft", "published"]).default("published"),
  });
  app.post("/api/tutorials", auth("tutor", "admin"), async (req, res) => {
    fail(
      400,
      "Upload a PDF or a JPEG, PNG or WebP image. Video and link uploads are not supported.",
    );
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: store.maxUploadBytes || 20 * 1024 * 1024, files: 1 },
  });
  app.post(
    "/api/tutorials/pdf",
    auth("tutor", "admin"),
    upload.single("file"),
    async (req, res) => {
      if (!store.available)
        fail(503, "PDF uploads require persistent storage configuration");
      if (
        !req.file ||
        req.file.mimetype !== "application/pdf" ||
        req.file.buffer.subarray(0, 5).toString() !== "%PDF-"
      )
        fail(
          400,
          "Choose a valid PDF document within the displayed size limit",
        );
      const s = tutorialSchema.parse(req.body),
        file = await store.put(req.file.buffer, "pdf", "application/pdf");
      try {
        const [tid] = await db("tutorials").insert({
          ...s,
          file,
          type: "pdf",
          tutor_id: req.user.id,
          created_at: now(),
        });
        res.status(201).json({ id: tid });
      } catch (error) {
        await store.remove(file).catch(() => {});
        throw error;
      }
    },
  );
  app.post(
    "/api/tutorials/image",
    auth("tutor", "admin"),
    upload.single("file"),
    async (req, res) => {
      if (!store.available) fail(503, "File storage is unavailable");
      if (
        !req.file ||
        !["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)
      )
        fail(400, "Choose a JPEG, PNG or WebP image. Videos are not allowed.");
      const metadata = tutorialSchema.parse(req.body);
      let buffer;
      try {
        const image = sharp(req.file.buffer, {
          limitInputPixels: 25000000,
          animated: true,
        });
        const info = await image.metadata();
        if (
          !["jpeg", "png", "webp"].includes(info.format) ||
          (info.pages || 1) !== 1
        )
          fail(400, "Choose a still JPEG, PNG or WebP image");
        buffer = await image
          .rotate()
          .resize({
            width: 2400,
            height: 2400,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        fail(400, "Choose a valid still JPEG, PNG or WebP image");
      }
      const file = await store.put(buffer, "webp", "image/webp");
      try {
        const [tid] = await db("tutorials").insert({
          ...metadata,
          file,
          type: "image",
          tutor_id: req.user.id,
          created_at: now(),
        });
        res.status(201).json({ id: tid });
      } catch (error) {
        await store.remove(file).catch(() => {});
        throw error;
      }
    },
  );
  app.get("/api/tutorials/:id/open", auth(), async (req, res) => {
    const t = await db("tutorials")
      .where({ id: id.parse(req.params.id) })
      .first();
    if (
      !t ||
      (t.status !== "published" &&
        req.user.role !== "admin" &&
        t.tutor_id !== req.user.id)
    )
      fail(404, "Resource not found");
    await db("views").insert({
      user_id: req.user.id,
      tutorial_id: t.id,
      created_at: now(),
    });
    if (t.type === "link") return res.redirect(t.url);
    await store.send(res, t.file, {
      attachment: true,
      type: t.type === "image" ? "image/webp" : "application/pdf",
    });
  });
  app.patch("/api/tutorials/:id", auth("admin"), async (req, res) => {
    const s = z
      .object({
        title: text.max(255).optional(),
        description: text.optional(),
        status: z.enum(["draft", "published"]).optional(),
      })
      .parse(req.body);
    await db("tutorials")
      .where({ id: id.parse(req.params.id) })
      .update(s);
    await audit(req.user.id, "content.update");
    res.json({ message: "Resource updated" });
  });
  app.delete("/api/tutorials/:id", auth("admin"), async (req, res) => {
    const tid = id.parse(req.params.id);
    const resource = await db("tutorials").where({ id: tid }).first();
    if (!resource) fail(404, "Resource not found");
    await db("tutorials").where({ id: tid }).del();
    if (resource.file) await store.remove(resource.file);
    res.json({ message: "Resource removed" });
  });
  app.get("/api/availability", auth("tutor"), async (req, res) =>
    res.json(
      await db("availability")
        .where({ tutor_id: req.user.id })
        .orderBy("starts_at"),
    ),
  );
  app.post("/api/availability", auth("tutor"), async (req, res) => {
    const s = z.object({ starts_at: date, ends_at: date }).parse(req.body);
    if (s.starts_at < now() || s.starts_at >= s.ends_at)
      fail(400, "Choose a valid future interval");
    const [aid] = await db("availability").insert({
      ...s,
      tutor_id: req.user.id,
    });
    res.status(201).json({ id: aid });
  });
  app.delete("/api/availability/:id", auth("tutor"), async (req, res) => {
    await db("availability")
      .where({ id: id.parse(req.params.id), tutor_id: req.user.id })
      .del();
    res.json({ message: "Availability removed" });
  });
  app.post("/api/requests", auth("student"), async (req, res) => {
    const s = z
      .object({
        tutor_id: id,
        subject_id: id,
        starts_at: date,
        duration: z.coerce.number().int().min(30).max(120),
        notes: text.max(2000),
      })
      .parse(req.body);
    if (s.starts_at < now()) fail(400, "Choose a future time");
    if (
      !(await db("users")
        .where({
          id: s.tutor_id,
          role: "tutor",
          status: "active",
          verified: true,
        })
        .first())
    )
      fail(400, "Tutor unavailable");
    if (
      !(await db("user_subjects")
        .where({ user_id: s.tutor_id, subject_id: s.subject_id })
        .first())
    )
      fail(400, "Choose a subject taught by this tutor");
    const [rid] = await db("requests").insert({
      ...s,
      student_id: req.user.id,
      created_at: now(),
    });
    res.status(201).json({ id: rid, message: "Awaiting admin assignment" });
  });
  for (const table of ["requests", "sessions"])
    app.get("/api/" + table, auth(), async (req, res) => {
      let q = db(table)
        .join("users as student", "student.id", table + ".student_id")
        .join("users as tutor", "tutor.id", table + ".tutor_id")
        .join("subjects", "subjects.id", table + ".subject_id")
        .select(
          table + ".*",
          "student.name as student_name",
          "tutor.name as tutor_name",
          "subjects.name as subject",
        );
      if (req.user.role !== "admin")
        q = q.where(
          table +
            "." +
            (req.user.role === "student" ? "student_id" : "tutor_id"),
          req.user.id,
        );
      if (table === "sessions")
        q = q
          .leftJoin("reviews", "reviews.session_id", "sessions.id")
          .select("reviews.rating as review_rating");
      res.json(await q.orderBy(table + ".created_at", "desc"));
    });
  app.post("/api/requests/:id/assign", auth("admin"), async (req, res) => {
    const rid = id.parse(req.params.id);
    const s = await db.transaction(async (trx) => {
      let q = trx("requests").where({ id: rid });
      if (db.client.config.client === "mysql2") q = q.forUpdate();
      const r = await q.first();
      if (!r || r.status !== "pending")
        fail(409, "Request is no longer pending");
      let locks = trx("users")
        .whereIn(
          "id",
          [r.student_id, r.tutor_id].sort((a, b) => a - b),
        )
        .orderBy("id");
      if (db.client.config.client === "mysql2") locks = locks.forUpdate();
      await locks.select("id");
      if (
        !(await trx("users")
          .where({
            id: r.tutor_id,
            role: "tutor",
            verified: true,
            status: "active",
          })
          .first())
      )
        fail(409, "Tutor unavailable");
      const ends_at = new Date(
        +new Date(r.starts_at) + r.duration * 60000,
      ).toISOString();
      if (r.starts_at < now()) fail(400, "Requested time has passed");
      if (
        !(await trx("availability")
          .where({ tutor_id: r.tutor_id })
          .where("starts_at", "<=", r.starts_at)
          .where("ends_at", ">=", ends_at)
          .first())
      )
        fail(409, "Outside tutor availability");
      if (
        await trx("sessions")
          .where({ status: "scheduled" })
          .where((b) =>
            b
              .where({ student_id: r.student_id })
              .orWhere({ tutor_id: r.tutor_id }),
          )
          .where("starts_at", "<", ends_at)
          .where("ends_at", ">", r.starts_at)
          .first()
      )
        fail(409, "Session conflicts with another booking");
      const s = {
        request_id: r.id,
        student_id: r.student_id,
        tutor_id: r.tutor_id,
        subject_id: r.subject_id,
        starts_at: r.starts_at,
        ends_at,
        status: "scheduled",
        created_at: now(),
      };
      const [sid] = await trx("sessions").insert(s);
      await trx("requests").where({ id: r.id }).update({ status: "assigned" });
      return { ...s, id: sid };
    });
    for (const uid of [s.student_id, s.tutor_id]) {
      await notify(
        uid,
        "Your session is confirmed",
        `Your session starts ${s.starts_at}`,
      );
      const u = await db("users").where({ id: uid }).first();
      await mail(
        u.email,
        "Your session is confirmed",
        `Your session starts ${s.starts_at}`,
        `confirmation:${s.id}:${uid}`,
      );
    }
    await audit(req.user.id, "session.assign:" + s.id);
    res.status(201).json(s);
  });
  app.patch("/api/sessions/:id", auth("admin"), async (req, res) => {
    const s = z
      .object({
        status: z.enum(["cancelled", "completed"]),
        reason: text.max(1000),
      })
      .parse(req.body);
    const session = await db("sessions")
      .where({ id: id.parse(req.params.id), status: "scheduled" })
      .first();
    if (!session) fail(409, "Session is not scheduled");
    if (s.status === "completed" && session.ends_at > now())
      fail(400, "Future sessions cannot be completed");
    await db("sessions").where({ id: session.id }).update(s);
    await db("mail")
      .where({ session_id: session.id, status: "pending" })
      .update({ status: "cancelled" });
    for (const uid of [session.student_id, session.tutor_id]) {
      await notify(uid, "Session " + s.status, s.reason);
      const u = await db("users").where({ id: uid }).first();
      await mail(u.email, "Session " + s.status, s.reason);
    }
    await audit(req.user.id, "session." + s.status);
    res.json({ message: "Session updated" });
  });
  app.get("/api/peers", auth(), async (req, res) => {
    if (req.user.role === "admin") return res.json([]);
    const own = req.user.role === "student" ? "student_id" : "tutor_id",
      other = req.user.role === "student" ? "tutor_id" : "student_id";
    const ids = (
      await db("sessions")
        .where({ [own]: req.user.id })
        .whereNot("status", "cancelled")
    ).map((s) => s[other]);
    const peers = await db("users")
      .whereIn("id", ids)
      .where({ status: "active" })
      .select("id", "name", "role");
    const unread = await db("messages")
      .where({ recipient_id: req.user.id, is_read: false })
      .select("sender_id")
      .count({ total: "id" })
      .groupBy("sender_id");
    res.json(
      peers.map((p) => ({
        ...p,
        unread: Number(unread.find((m) => m.sender_id === p.id)?.total || 0),
      })),
    );
  });
  const canMessage = async (a, b) =>
    a.role !== b.role &&
    ["student", "tutor"].includes(a.role) &&
    ["student", "tutor"].includes(b.role) &&
    (await db("sessions")
      .where({
        student_id: a.role === "student" ? a.id : b.id,
        tutor_id: a.role === "tutor" ? a.id : b.id,
      })
      .whereNot("status", "cancelled")
      .first());
  app.get("/api/messages/:peer", auth("student", "tutor"), async (req, res) => {
    const p = await db("users")
      .where({ id: id.parse(req.params.peer), status: "active" })
      .first();
    if (!p || !(await canMessage(req.user, p)))
      fail(403, "Messaging is limited to assigned learning partners");
    await db("messages")
      .where({ sender_id: p.id, recipient_id: req.user.id })
      .update({ is_read: true });
    res.json(
      await db("messages")
        .where((b) =>
          b
            .where({ sender_id: req.user.id, recipient_id: p.id })
            .orWhere({ sender_id: p.id, recipient_id: req.user.id }),
        )
        .orderBy("id"),
    );
  });
  app.post(
    "/api/messages/:peer",
    auth("student", "tutor"),
    async (req, res) => {
      const { body } = z.object({ body: text.max(3000) }).parse(req.body);
      const p = await db("users")
        .where({ id: id.parse(req.params.peer), status: "active" })
        .first();
      if (!p || !(await canMessage(req.user, p)))
        fail(403, "Messaging is limited to assigned learning partners");
      await db("messages").insert({
        sender_id: req.user.id,
        recipient_id: p.id,
        body,
        created_at: now(),
      });
      await notify(
        p.id,
        "New message",
        "You have a message from " + req.user.name,
      );
      res.status(201).json({ message: "Message sent" });
    },
  );
  app.post("/api/reviews", auth("student"), async (req, res) => {
    const s = z
      .object({
        session_id: id,
        rating: z.coerce.number().int().min(1).max(5),
        body: text.max(2000),
      })
      .parse(req.body);
    const session = await db("sessions")
      .where({ id: s.session_id, student_id: req.user.id, status: "completed" })
      .first();
    if (!session) fail(403, "Complete a session before reviewing");
    if (await db("reviews").where({ session_id: s.session_id }).first())
      fail(409, "Session already reviewed");
    await db("reviews").insert({
      ...s,
      student_id: req.user.id,
      tutor_id: session.tutor_id,
      created_at: now(),
    });
    res.status(201).json({ message: "Review published" });
  });
  app.get("/api/notifications", auth(), async (req, res) =>
    res.json(
      await db("notifications")
        .where({ user_id: req.user.id })
        .orderBy("id", "desc")
        .limit(100),
    ),
  );
  app.post("/api/notifications/read", auth(), async (req, res) => {
    await db("notifications")
      .where({ user_id: req.user.id })
      .update({ is_read: true });
    res.json({ message: "Notifications marked as read" });
  });
  app.get("/api/announcements", auth(), async (req, res) =>
    res.json(await db("announcements").orderBy("id", "desc").limit(50)),
  );
  app.post("/api/announcements", auth("admin"), async (req, res) => {
    const s = z.object({ title: text.max(255), body: text }).parse(req.body);
    const [aid] = await db("announcements").insert({
      ...s,
      admin_id: req.user.id,
      created_at: now(),
    });
    for (const u of await db("users").where({
      status: "active",
      verified: true,
    })) {
      await notify(u.id, s.title, s.body);
      await mail(u.email, s.title, s.body, `announcement:${aid}:${u.id}`);
    }
    res.status(201).json({ message: "Announcement published" });
  });
  app.use("/api/admin", auth("admin"), (req, res, next) => {
    if (!req.session?.recent_until || req.session.recent_until < now())
      return res
        .status(428)
        .json({ error: "Confirm your password to continue", reauth: true });
    next();
  });
  app.get("/api/admin/users", auth("admin"), async (req, res) =>
    res.json((await db("users").orderBy("id", "desc")).map(safe)),
  );
  app.patch("/api/admin/users/:id", auth("admin"), async (req, res) => {
    const uid = id.parse(req.params.id),
      s = z
        .object({ status: z.enum(["active", "rejected", "suspended"]) })
        .parse(req.body);
    const u = await db("users").where({ id: uid }).first();
    if (!u) fail(404, "User not found");
    if (u.role === "admin") fail(403, "Admin accounts cannot be changed here");
    await db("users").where({ id: uid }).update(s);
    await db("auth_sessions").where({ user_id: uid }).del();
    await notify(uid, "Account status updated", "Your account is " + s.status);
    await audit(req.user.id, "user." + s.status);
    res.json({ message: "Account updated" });
  });
  app.get("/api/stats", auth(), async (req, res) => {
    const count = async (q) => Number((await q.count({ n: "*" }).first()).n),
      admin = req.user.role === "admin";
    let sessions = db("sessions"),
      resources = db("tutorials").where({ status: "published" }),
      views = db("views");
    if (!admin) {
      sessions.where({
        [req.user.role === "student" ? "student_id" : "tutor_id"]: req.user.id,
      });
      views.where({ user_id: req.user.id });
      if (req.user.role === "tutor") resources.where({ tutor_id: req.user.id });
    }
    res.json({
      sessions: await count(sessions),
      tutorials: await count(resources),
      views: await count(views),
      ...(admin
        ? {
            students: await count(db("users").where({ role: "student" })),
            tutors: await count(
              db("users").where({ role: "tutor", status: "active" }),
            ),
            pending: await count(
              db("users").where({ role: "tutor", status: "pending" }),
            ),
          }
        : {}),
    });
  });
  app.get("/api/admin/export", auth("admin"), async (req, res) => {
    const rows = await db("sessions").select(
      "id",
      "student_id",
      "tutor_id",
      "starts_at",
      "ends_at",
      "status",
    );
    if (req.query.format === "pdf") {
      res.type("pdf").attachment("sessions.pdf");
      const pdf = new PDFDocument();
      pdf.pipe(res);
      pdf.fontSize(22).text("SmartTutor session report").moveDown();
      for (const r of rows)
        pdf
          .fontSize(11)
          .text(
            `#${r.id} · ${r.status}\n${r.starts_at}\nStudent ${r.student_id} / Tutor ${r.tutor_id}`,
          )
          .moveDown();
      pdf.end();
      return;
    }
    if (req.query.format === "xlsx") {
      res
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .attachment("sessions.xlsx")
        .send(spreadsheet(rows));
      return;
    }

    res
      .type("csv")
      .attachment("sessions.csv")
      .send(
        [
          "id,student_id,tutor_id,starts_at,ends_at,status",
          ...rows.map((r) =>
            [
              r.id,
              r.student_id,
              r.tutor_id,
              r.starts_at,
              r.ends_at,
              r.status,
            ].join(","),
          ),
        ].join("\n"),
      );
  });
  app.post(
    "/api/contact",
    rateLimit({ windowMs: 3600000, limit: 10 }),
    async (req, res) => {
      const s = z
        .object({ name: text.max(100), email: z.email(), body: text })
        .parse(req.body);
      await db("contacts").insert({ ...s, created_at: now() });
      res
        .status(201)
        .json({ message: "Your enquiry is saved for the admin team." });
    },
  );
  app.get("/api/admin/contacts", auth("admin"), async (req, res) =>
    res.json(await db("contacts").orderBy("id", "desc")),
  );
  features(app, db, { auth, notify, mail, audit, store });
  if (!production)
    app.get("/api/dev/mail", async (req, res) =>
      res.json(await db("mail").orderBy("id", "desc").limit(100)),
    );
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status =
      err instanceof z.ZodError
        ? 400
        : err.code === "LIMIT_FILE_SIZE"
          ? 413
          : err.status || 500;
    res.status(status).json({
      error:
        err instanceof z.ZodError
          ? err.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")
          : status === 500
            ? "Something went wrong. Please try again."
            : err.message,
    });
    if (status === 500) console.error(err.code || err.name, err.message);
  });
  return app;
}
export { jobs } from "./jobs.js";
