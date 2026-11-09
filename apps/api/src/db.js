import knex from "knex";
import { upgrades } from "./upgrades.js";
import { mysqlConnection } from "./database-config.js";
import fs from "node:fs";
import path from "node:path";
export const now = () => new Date().toISOString();
export function database(filename, env = process.env) {
  const connection = !filename ? mysqlConnection(env) : null;
  const mysql = !!connection;
  const file =
    filename || path.resolve(env.DATA_DIR || "data", "smarttutor.sqlite");
  if (!mysql && file !== ":memory:")
    fs.mkdirSync(path.dirname(file), { recursive: true });
  return knex(
    mysql
      ? {
          client: "mysql2",
          connection,
          pool: { min: 0, max: env.VERCEL ? 2 : 5 },
        }
      : {
          client: "better-sqlite3",
          connection: { filename: file },
          useNullAsDefault: true,
          pool: {
            afterCreate: (c, done) => {
              c.pragma("foreign_keys = ON");
              done(null, c);
            },
          },
        },
  );
}
async function migrateSchema(db) {
  const ref = (t, n, table = "users") =>
    t.integer(n).unsigned().references("id").inTable(table);
  const tables = {
    users: (t) => {
      t.increments();
      t.string("name");
      t.string("username").unique();
      t.string("email").unique();
      t.string("password");
      t.string("role");
      t.string("status").defaultTo("active");
      t.boolean("verified").defaultTo(false);
      t.text("bio");
      t.text("qualifications");
      t.string("dob");
      t.string("address");
      t.string("created_at");
    },
    subjects: (t) => {
      t.increments();
      t.string("name").unique();
      t.string("color");
    },
    user_subjects: (t) => {
      ref(t, "user_id");
      ref(t, "subject_id", "subjects");
      t.unique(["user_id", "subject_id"]);
    },
    challenges: (t) => {
      t.increments();
      ref(t, "user_id");
      t.string("kind");
      t.string("digest").index();
      t.string("expires_at");
      t.integer("attempts").defaultTo(0);
    },
    auth_sessions: (t) => {
      t.string("digest").primary();
      ref(t, "user_id");
      t.string("expires_at");
    },
    availability: (t) => {
      t.increments();
      ref(t, "tutor_id");
      t.string("starts_at");
      t.string("ends_at");
    },
    requests: (t) => {
      t.increments();
      ref(t, "student_id");
      ref(t, "tutor_id");
      ref(t, "subject_id", "subjects");
      t.string("starts_at");
      t.integer("duration");
      t.text("notes");
      t.string("status").defaultTo("pending");
      t.string("created_at");
    },
    sessions: (t) => {
      t.increments();
      ref(t, "request_id", "requests").unique();
      ref(t, "student_id");
      ref(t, "tutor_id");
      ref(t, "subject_id", "subjects");
      t.string("starts_at");
      t.string("ends_at");
      t.string("status").defaultTo("scheduled");
      t.text("reason");
      t.string("created_at");
    },
    tutorials: (t) => {
      t.increments();
      ref(t, "tutor_id");
      ref(t, "subject_id", "subjects");
      t.string("title");
      t.text("description");
      t.string("difficulty");
      t.string("type");
      t.string("url", 1024);
      t.string("file");
      t.string("status").defaultTo("published");
      t.string("created_at");
    },
    views: (t) => {
      t.increments();
      ref(t, "user_id");
      ref(t, "tutorial_id", "tutorials").onDelete("CASCADE");
      t.string("created_at");
    },
    messages: (t) => {
      t.increments();
      ref(t, "sender_id");
      ref(t, "recipient_id");
      t.text("body");
      t.boolean("is_read").defaultTo(false);
      t.string("created_at");
    },
    reviews: (t) => {
      t.increments();
      ref(t, "session_id", "sessions").unique();
      ref(t, "student_id");
      ref(t, "tutor_id");
      t.integer("rating");
      t.text("body");
      t.string("created_at");
    },
    notifications: (t) => {
      t.increments();
      ref(t, "user_id");
      t.string("title");
      t.text("body");
      t.boolean("is_read").defaultTo(false);
      t.string("created_at");
    },
    announcements: (t) => {
      t.increments();
      ref(t, "admin_id");
      t.string("title");
      t.text("body");
      t.string("created_at");
    },
    mail: (t) => {
      t.increments();
      t.string("recipient");
      t.string("subject");
      t.text("body");
      t.string("job_key").unique();
      t.string("status").defaultTo("pending");
      t.integer("attempts").defaultTo(0);
      t.string("created_at");
    },
    audit: (t) => {
      t.increments();
      ref(t, "user_id");
      t.string("action");
      t.string("created_at");
    },
    contacts: (t) => {
      t.increments();
      t.string("name");
      t.string("email");
      t.text("body");
      t.string("created_at");
    },
  };
  for (const [name, columns] of Object.entries(tables))
    if (!(await db.schema.hasTable(name)))
      await db.schema.createTable(name, columns);
  await upgrades(db);
  // Reference categories are required even on a fresh production database.
  // This does not create demo users, passwords, sessions or teaching content.
  for (const [name, color] of [
    ["Mathematics", "peach"],
    ["Computer Science", "mint"],
    ["English", "lavender"],
    ["Physics", "blue"],
    ["Business", "yellow"],
    ["Chemistry", "pink"],
  ]) {
    await db("subjects").insert({ name, color }).onConflict("name").ignore();
  }
}

// Serialize cold-start schema upgrades across Vercel instances on MySQL.
export async function migrate(db) {
  if (db.client.config.client !== "mysql2") return migrateSchema(db);
  const connection = await db.client.acquireConnection();
  let locked = false;
  try {
    const [rows] = await db
      .raw(
        "SELECT GET_LOCK(CONCAT('smarttutor:', LEFT(SHA2(DATABASE(),256),40)),25) AS acquired",
      )
      .connection(connection);
    if (Number(rows[0].acquired) !== 1)
      throw Object.assign(new Error("Database migration lock timed out"), {
        code: "MIGRATION_BUSY",
      });
    locked = true;
    await migrateSchema(db);
  } finally {
    try {
      if (locked)
        await db
          .raw(
            "SELECT RELEASE_LOCK(CONCAT('smarttutor:', LEFT(SHA2(DATABASE(),256),40)))",
          )
          .connection(connection);
    } finally {
      await db.client.releaseConnection(connection);
    }
  }
}
