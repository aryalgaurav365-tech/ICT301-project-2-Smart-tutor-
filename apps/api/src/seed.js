import "./config.js";
import bcrypt from "bcryptjs";
import { database, migrate, now } from "./db.js";
import { hasDatabaseConfig } from "./database-config.js";
export async function seed(db) {
  if (
    process.env.NODE_ENV === "production" ||
    (hasDatabaseConfig() && !process.env.ALLOW_DEMO_SEED)
  )
    throw new Error("Demo seed disabled in production");
  for (const [name, color] of [
    ["Mathematics", "peach"],
    ["Computer Science", "mint"],
    ["English", "lavender"],
    ["Physics", "blue"],
    ["Business", "yellow"],
    ["Chemistry", "pink"],
  ])
    if (!(await db("subjects").where({ name }).first()))
      await db("subjects").insert({ name, color });
  for (const [name, username, role, bio] of [
    ["Alex Morgan", "alex", "student", "Your next chapter starts here."],
    [
      "Elena Brooks",
      "elena",
      "tutor",
      "Making tricky concepts click. Build confidence in mathematics, one small breakthrough at a time.",
    ],
    [
      "Marcus Chen",
      "marcus",
      "tutor",
      "From your first line of code to your next big idea. Patient, practical computer science tutoring.",
    ],
    [
      "Sophie Wilson",
      "sophie",
      "tutor",
      "Find your voice. Thoughtful guidance with essays, literature, and academic writing.",
    ],
    ["Jordan Admin", "admin", "admin", "Platform administrator"],
  ]) {
    if (await db("users").where({ username }).first()) continue;
    const [uid] = await db("users").insert({
      name,
      username,
      role,
      bio,
      email: username + "@smarttutor.test",
      password: await bcrypt.hash("LearnTogether!26", 12),
      verified: true,
      status: "active",
      qualifications:
        role === "tutor"
          ? "Demonstration profile — credentials not independently verified"
          : null,
      created_at: now(),
    });
    if (role === "tutor") {
      const sid = (
        await db("subjects")
          .where({
            name:
              username === "elena"
                ? "Mathematics"
                : username === "marcus"
                  ? "Computer Science"
                  : "English",
          })
          .first()
      ).id;
      await db("user_subjects").insert({ user_id: uid, subject_id: sid });
      for (let d = 1; d <= 7; d++) {
        const start = new Date();
        start.setUTCDate(start.getUTCDate() + d);
        start.setUTCHours(5, 0, 0, 0);
        await db("availability").insert({
          tutor_id: uid,
          starts_at: start.toISOString(),
          ends_at: new Date(+start + 4 * 3600000).toISOString(),
        });
      }
      await db("tutorials").insert({
        tutor_id: uid,
        subject_id: sid,
        title:
          username === "elena"
            ? "A fresh perspective on algebra"
            : username === "marcus"
              ? "Your first steps with JavaScript"
              : "Writing an essay that connects",
        description:
          "Explore the fundamentals and bring your questions to your next session. A carefully selected starting point for curious minds.",
        difficulty: "Beginner",
        type: "link",
        url:
          username === "marcus"
            ? "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide"
            : username === "elena"
              ? "https://www.khanacademy.org/math/algebra"
              : "https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/index.html",
        status: "published",
        created_at: now(),
      });
    }
  }
}
if (process.argv[1]?.endsWith("/seed.js")) {
  const db = database();
  try {
    await migrate(db);
    await seed(db);
    console.log("Synthetic demo accounts seeded.");
  } finally {
    await db.destroy();
  }
}
