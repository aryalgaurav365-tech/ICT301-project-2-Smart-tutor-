import { z } from "zod";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import multer from "multer";
import { randomBytes, createHash } from "node:crypto";
import { now } from "./db.js";
const id = z.coerce.number().int().positive(),
  text = z.string().trim().min(1).max(3000),
  date = z
    .string()
    .datetime({ offset: true })
    .transform((v) => new Date(v).toISOString());
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export function features(app, db, { auth, notify, mail, audit, store }) {
  const recent = (req, res, next) => {
    if (!req.session?.recent_until || req.session.recent_until < now())
      return res
        .status(428)
        .json({ error: "Confirm your password to continue", reauth: true });
    next();
  };
  app.post("/api/auth/reauth", auth(), async (req, res) => {
    const { password } = z.object({ password: text }).parse(req.body);
    if (!(await bcrypt.compare(password, req.user.password)))
      fail(401, "Password is incorrect");
    await db("auth_sessions")
      .where({ digest: req.session.digest })
      .update({
        recent_until: new Date(Date.now() + 15 * 60000).toISOString(),
      });
    res.json({ message: "Identity confirmed for 15 minutes" });
  });
  app.get("/api/profile", auth(), async (req, res) => {
    const { password, ...user } = req.user;
    user.subjects = (await db("user_subjects").where({ user_id: user.id })).map(
      (s) => s.subject_id,
    );
    res.json(user);
  });
  app.patch("/api/profile", auth(), async (req, res) => {
    const s = z
      .object({
        name: text.max(100),
        bio: z.string().trim().max(3000).default(""),
        qualifications: z.string().max(3000).optional(),
        address: z.string().max(255).optional(),
        timezone: z.string().refine((v) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: v });
            return true;
          } catch {
            return false;
          }
        }, "Choose an IANA timezone"),
        subjects: z.array(id).min(1),
      })
      .parse(req.body);
    const { subjects, ...fields } = s;
    await db.transaction(async (trx) => {
      await trx("users").where({ id: req.user.id }).update(fields);
      await trx("user_subjects").where({ user_id: req.user.id }).del();
      for (const subject_id of [...new Set(subjects)])
        await trx("user_subjects").insert({ user_id: req.user.id, subject_id });
    });
    await audit(req.user.id, "profile.update");
    res.json({ message: "Profile updated" });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  app.post(
    "/api/profile/photo",
    auth(),
    upload.single("file"),
    async (req, res) => {
      if (!req.file) fail(400, "Choose an image");
      const image = sharp(req.file.buffer, { limitInputPixels: 16000000 });
      let metadata;
      try {
        metadata = await image.metadata();
      } catch {
        fail(400, "Choose a valid JPEG, PNG or WebP image");
      }
      if (!["jpeg", "png", "webp"].includes(metadata.format))
        fail(400, "Choose JPEG, PNG or WebP");
      const bytes = await image
        .rotate()
        .resize(400, 400, { fit: "cover" })
        .webp({ quality: 82 })
        .toBuffer();
      const file = await store.put(bytes, "webp", "image/webp");
      await db("users").where({ id: req.user.id }).update({ photo: file });
      res.json({ message: "Profile photo updated" });
    },
  );
  app.get("/api/users/:id/photo", async (req, res) => {
    const user = await db("users")
      .where({
        id: id.parse(req.params.id),
        role: "tutor",
        status: "active",
        verified: true,
      })
      .first();
    if (!user?.photo) fail(404, "Photo not found");
    await store.send(res, user.photo, { type: "image/webp" });
  });
  app.get("/api/profile/photo", auth(), async (req, res) => {
    if (!req.user.photo) fail(404, "Photo not found");
    await store.send(res, req.user.photo, { type: "image/webp" });
  });
  app.post("/api/admin/invites", auth("admin"), recent, async (req, res) => {
    const { email } = z.object({ email: z.email() }).parse(req.body),
      code = randomBytes(32).toString("hex");
    await db("admin_invites").insert({
      email: email.toLowerCase(),
      digest: createHash("sha256").update(code).digest("hex"),
      created_by: req.user.id,
      expires_at: new Date(Date.now() + 48 * 3600000).toISOString(),
    });
    await mail(
      email,
      "Your SmartTutor administrator invitation",
      `Register at ${process.env.APP_URL || "http://localhost:5173"}/register with your email and this single-use invitation: ${code}`,
    );
    await audit(req.user.id, "admin.invite");
    res.status(201).json({
      message: "Administrator invitation emailed. It expires in 48 hours.",
    });
  });
  app.get("/api/my/tutorials", auth("tutor", "admin"), async (req, res) =>
    res.json(
      await db("tutorials")
        .where({ tutor_id: req.user.id })
        .orderBy("id", "desc"),
    ),
  );
  app.patch(
    "/api/my/tutorials/:id",
    auth("tutor", "admin"),
    async (req, res) => {
      const tid = id.parse(req.params.id),
        s = z
          .object({
            title: text.max(255),
            description: text,
            subject_id: id,
            difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
            status: z.enum(["draft", "published"]),
          })
          .parse(req.body);
      const changed = await db("tutorials")
        .where({ id: tid, tutor_id: req.user.id, status: "draft" })
        .update(s);
      if (!changed) fail(403, "Only your unpublished drafts can be edited");
      res.json({ message: "Draft saved" });
    },
  );
  app.delete(
    "/api/my/tutorials/:id",
    auth("tutor", "admin"),
    async (req, res) => {
      const t = await db("tutorials")
        .where({
          id: id.parse(req.params.id),
          tutor_id: req.user.id,
          status: "draft",
        })
        .first();
      if (!t) fail(403, "Only your unpublished drafts can be removed");
      await db("tutorials").where({ id: t.id, status: "draft" }).del();
      res.json({ message: "Draft removed" });
    },
  );
  app.post("/api/requests/:id/withdraw", auth("student"), async (req, res) => {
    const n = await db("requests")
      .where({
        id: id.parse(req.params.id),
        student_id: req.user.id,
        status: "pending",
      })
      .update({ status: "withdrawn" });
    if (!n) fail(409, "Only pending requests can be withdrawn");
    res.json({ message: "Request withdrawn" });
  });
  app.post(
    "/api/requests/:id/reject",
    auth("admin"),
    recent,
    async (req, res) => {
      const { reason } = z.object({ reason: text }).parse(req.body),
        r = await db("requests")
          .where({ id: id.parse(req.params.id), status: "pending" })
          .first();
      if (!r) fail(409, "Request is no longer pending");
      await db("requests").where({ id: r.id }).update({ status: "rejected" });
      await notify(r.student_id, "Session request declined", reason);
      res.json({ message: "Request declined" });
    },
  );
  app.post(
    "/api/session-changes",
    auth("student", "tutor"),
    async (req, res) => {
      const s = z
        .object({
          session_id: id,
          kind: z.enum(["cancel", "reschedule"]),
          reason: text,
          starts_at: date.optional(),
        })
        .parse(req.body);
      const session = await db("sessions")
        .where({
          id: s.session_id,
          status: "scheduled",
          [req.user.role === "student" ? "student_id" : "tutor_id"]:
            req.user.id,
        })
        .first();
      if (!session)
        fail(403, "You can only request changes to your scheduled sessions");
      if (s.kind === "reschedule" && (!s.starts_at || s.starts_at < now()))
        fail(400, "Choose a future time");
      if (
        await db("session_changes")
          .where({ session_id: session.id, status: "pending" })
          .first()
      )
        fail(409, "This session already has a pending change");
      await db("session_changes").insert({
        ...s,
        user_id: req.user.id,
        created_at: now(),
      });
      res.status(201).json({
        message:
          "Change requested. Your existing booking remains until admin approval.",
      });
    },
  );
  app.get("/api/session-changes", auth(), async (req, res) => {
    let q = db("session_changes");
    if (req.user.role !== "admin") q = q.where({ user_id: req.user.id });
    res.json(await q.orderBy("id", "desc"));
  });
  app.post(
    "/api/session-changes/:id/resolve",
    auth("admin"),
    recent,
    async (req, res) => {
      const { approve, resolution } = z
        .object({ approve: z.boolean(), resolution: text })
        .parse(req.body);
      const result = await db.transaction(async (trx) => {
        let q = trx("session_changes").where({ id: id.parse(req.params.id) });
        if (db.client.config.client === "mysql2") q = q.forUpdate();
        const change = await q.first();
        if (!change || change.status !== "pending")
          fail(409, "Change is no longer pending");
        const s = await trx("sessions")
          .where({ id: change.session_id })
          .first();
        if (!s || s.status !== "scheduled")
          fail(409, "Session is not scheduled");
        if (approve) {
          let lock = trx("users")
            .whereIn(
              "id",
              [s.tutor_id, s.student_id].sort((a, b) => a - b),
            )
            .orderBy("id");
          if (db.client.config.client === "mysql2") lock = lock.forUpdate();
          await lock.select("id");
          if (change.kind === "cancel")
            await trx("sessions")
              .where({ id: s.id, status: "scheduled" })
              .update({ status: "cancelled", reason: change.reason });
          else {
            const start = change.starts_at,
              end = new Date(
                +new Date(start) +
                  (+new Date(s.ends_at) - +new Date(s.starts_at)),
              ).toISOString();
            if (start < now()) fail(400, "Requested time has passed");
            if (
              !(await trx("availability")
                .where({ tutor_id: s.tutor_id })
                .where("starts_at", "<=", start)
                .where("ends_at", ">=", end)
                .first())
            )
              fail(409, "Requested time is outside availability");
            if (
              await trx("sessions")
                .where({ status: "scheduled" })
                .whereNot("id", s.id)
                .where((b) =>
                  b
                    .where({ student_id: s.student_id })
                    .orWhere({ tutor_id: s.tutor_id }),
                )
                .where("starts_at", "<", end)
                .where("ends_at", ">", start)
                .first()
            )
              fail(409, "Requested time conflicts with a booking");
            await trx("sessions").where({ id: s.id }).update({
              starts_at: start,
              ends_at: end,
              reason: change.reason,
            });
          }
          await trx("mail")
            .where({ session_id: s.id, status: "pending" })
            .update({ status: "cancelled" });
        }
        await trx("session_changes")
          .where({ id: change.id })
          .update({ status: approve ? "approved" : "rejected", resolution });
        return s;
      });
      for (const uid of [result.student_id, result.tutor_id]) {
        await notify(
          uid,
          "Session change " + (approve ? "approved" : "declined"),
          resolution,
        );
        const u = await db("users").where({ id: uid }).first();
        await mail(
          u.email,
          "Session change " + (approve ? "approved" : "declined"),
          resolution,
        );
      }
      await audit(req.user.id, "session.change.resolve");
      res.json({ message: "Change request resolved" });
    },
  );
  app.get("/api/analytics", auth(), async (req, res) => {
    const from = req.query.from
        ? z.string().date().parse(req.query.from)
        : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      to = req.query.to
        ? z.string().date().parse(req.query.to)
        : now().slice(0, 10);
    if (from > to || +new Date(to) - +new Date(from) > 366 * 86400000)
      fail(400, "Select a range of up to one year");
    const end = to + "T23:59:59.999Z",
      admin = req.user.role === "admin";
    let sessions = db("sessions").whereBetween("starts_at", [from, end]),
      views = db("views")
        .join("tutorials", "tutorials.id", "views.tutorial_id")
        .join("subjects", "subjects.id", "tutorials.subject_id")
        .whereBetween("views.created_at", [from, end])
        .select("views.created_at", "subjects.name");
    let logins = db("audit")
      .where({ action: "login" })
      .whereBetween("created_at", [from, end]);
    let reviews = db("reviews").whereBetween("created_at", [from, end]);
    if (!admin) {
      sessions.where({
        [req.user.role === "student" ? "student_id" : "tutor_id"]: req.user.id,
      });
      if (req.user.role === "tutor") {
        views.where("tutorials.tutor_id", req.user.id);
        reviews.where({ tutor_id: req.user.id });
      } else {
        views.where("views.user_id", req.user.id);
        reviews.where({ student_id: req.user.id });
      }
      logins.where({ user_id: req.user.id });
    }
    const [ss, vv, ll, rr] = await Promise.all([
      sessions,
      views,
      logins,
      reviews,
    ]);
    const days = {};
    for (
      let d = new Date(from);
      d <= new Date(to);
      d.setUTCDate(d.getUTCDate() + 1)
    )
      days[d.toISOString().slice(0, 10)] = {
        date: d.toISOString().slice(0, 10),
        sessions: 0,
        views: 0,
        logins: 0,
      };
    for (const [rows, field, key] of [
      [ss, "starts_at", "sessions"],
      [vv, "created_at", "views"],
      [ll, "created_at", "logins"],
    ])
      for (const r of rows) {
        const day = days[r[field].slice(0, 10)];
        if (day) day[key]++;
      }
    const subjects = {};
    for (const v of vv) subjects[v.name] = (subjects[v.name] || 0) + 1;
    res.json({
      from,
      to,
      days: Object.values(days),
      subjects: Object.entries(subjects).map(([name, views]) => ({
        name,
        views,
      })),
      completed: ss.filter((s) => s.status === "completed").length,
      minutes: ss
        .filter((s) => s.status === "completed")
        .reduce(
          (sum, s) =>
            sum + (+new Date(s.ends_at) - +new Date(s.starts_at)) / 60000,
          0,
        ),
      averageRating: rr.length
        ? rr.reduce((sum, r) => sum + r.rating, 0) / rr.length
        : null,
    });
  });
  app.post("/api/admin/students", auth("admin"), recent, async (req, res) => {
    const p = z
      .object({
        name: text.max(100),
        username: z.string().regex(/^[a-zA-Z0-9_]{3,40}$/),
        email: z.email(),
        dob: z.string().date(),
        address: text.max(255),
        subjects: z.array(id).min(1),
      })
      .parse(req.body);
    if (
      await db("users")
        .where({ email: p.email.toLowerCase() })
        .orWhere({ username: p.username })
        .first()
    )
      fail(409, "Email or username already registered");
    const password = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
    const uid = await db.transaction(async (trx) => {
      const [uid] = await trx("users").insert({
        name: p.name,
        username: p.username,
        email: p.email.toLowerCase(),
        dob: p.dob,
        address: p.address,
        password,
        role: "student",
        status: "active",
        verified: false,
        created_at: now(),
      });
      for (const subject_id of [...new Set(p.subjects)])
        await trx("user_subjects").insert({ user_id: uid, subject_id });
      return uid;
    });
    for (const kind of ["verify", "reset"]) {
      const code = randomBytes(32).toString("hex");
      await db("challenges").insert({
        user_id: uid,
        kind,
        digest: createHash("sha256").update(code).digest("hex"),
        expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
      });
      await mail(
        p.email,
        kind === "verify"
          ? "Verify your new SmartTutor account"
          : "Set your SmartTutor password",
        `Open ${process.env.APP_URL || "http://localhost:5173"}/${kind === "verify" ? "verify" : "reset-password"}?token=${code}`,
      );
    }
    await audit(req.user.id, "student.create");
    res.status(201).json({
      message:
        "Student account created. Verification and password setup emails queued.",
    });
  });
  app.post("/api/admin/subjects", auth("admin"), recent, async (req, res) => {
    const { name } = z.object({ name: text.max(100) }).parse(req.body);
    if (await db("subjects").where({ name }).first())
      fail(409, "Subject already exists");
    await db("subjects").insert({ name, color: "mint" });
    await audit(req.user.id, "subject.create");
    res.status(201).json({ message: "Subject added" });
  });
  app.get("/api/admin/audit", auth("admin"), recent, async (req, res) =>
    res.json(
      await db("audit")
        .join("users", "users.id", "audit.user_id")
        .select("audit.id", "audit.action", "audit.created_at", "users.name")
        .orderBy("audit.id", "desc")
        .limit(200),
    ),
  );
  app.get("/api/admin/mail", auth("admin"), recent, async (req, res) =>
    res.json(
      await db("mail")
        .select(
          "id",
          "recipient",
          "subject",
          "status",
          "attempts",
          "created_at",
        )
        .orderBy("id", "desc")
        .limit(200),
    ),
  );
  app.post(
    "/api/admin/mail/:id/retry",
    auth("admin"),
    recent,
    async (req, res) => {
      const m = await db("mail")
        .where({ id: id.parse(req.params.id) })
        .first();
      if (!m || m.status !== "failed")
        fail(409, "Only failed deliveries can be retried");
      await db("mail").where({ id: m.id, status: "failed" }).update({
        status: "pending",
        attempts: 0,
        next_attempt_at: now(),
        lease_until: null,
        lease_token: null,
      });
      res.json({ message: "Delivery queued for retry" });
    },
  );
}
