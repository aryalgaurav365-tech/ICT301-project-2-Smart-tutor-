import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createVercelHandler, routedUrl } from "../apps/api/src/vercel.js";
import { initialize } from "../apps/api/src/runtime.js";
import { database, migrate } from "../apps/api/src/db.js";
import { createApp } from "../apps/api/src/app.js";
import { bootstrapAdmin } from "../apps/api/src/bootstrap.js";
import { seed } from "../apps/api/src/seed.js";
const listen = async (handler) => {
  const server = createServer(handler).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
};
const close = (server) => new Promise((r) => server.close(r));
test("Vercel routes preserve API queries and reject path traversal", () => {
  assert.equal(
    routedUrl("/api/index?__route=analytics&from=2026-11-01"),
    "/api/analytics?from=2026-11-01",
  );
  assert.equal(routedUrl("/api/health"), "/api/health");
  assert.throws(() => routedUrl("/api/index?__route=../health"));
  assert.throws(() => routedUrl("/index.html"));
});
test("fresh production initialization supplies reference subjects without demo users", async () => {
  const db = database(":memory:");
  try {
    const runtime = await initialize({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "test-only-injected-database",
        APP_URL: "https://smarttutor.test",
      },
      makeDatabase: () => db,
    });
    assert.equal((await db("users")).length, 0);
    assert.equal((await db("subjects")).length, 6);
    await migrate(db);
    assert.equal((await db("subjects")).length, 6);
    assert.equal(runtime.pendingBootstrap, false);
  } finally {
    await db.destroy();
  }
});
test("production refuses absent database or non-HTTPS public origin before opening a connection", async () => {
  let opened = false;
  const makeDatabase = () => {
    opened = true;
  };
  await assert.rejects(
    initialize({ env: { NODE_ENV: "production" }, makeDatabase }),
    (e) => e.code === "CONFIG_DATABASE",
  );
  await assert.rejects(
    initialize({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "test",
        APP_URL: "http://unsafe.example",
      },
      makeDatabase,
    }),
    (e) => e.code === "CONFIG_APP_URL",
  );
  assert.equal(opened, false);
});
test("first administrator is invited once to the configured email without setting a demo password", async () => {
  const db = database(":memory:");
  try {
    await migrate(db);
    const env = {
      INITIAL_ADMIN_EMAIL: "owner@example.test",
      APP_URL: "https://smarttutor.test",
    };
    assert.equal(await bootstrapAdmin(db, env), true);
    assert.equal(await bootstrapAdmin(db, env), true);
    assert.equal((await db("admin_invites")).length, 1);
    assert.equal((await db("mail")).length, 1);
    assert.equal((await db("users")).length, 0);
    const invite = await db("admin_invites").first(),
      mail = await db("mail").first();
    assert.notEqual(invite.digest, mail.body.match(/[a-f0-9]{64}/)[0]);
    assert.equal(mail.recipient, "owner@example.test");
  } finally {
    await db.destroy();
  }
});
test("warm Vercel function reuses initialization, authenticates and registers post-response email work", async () => {
  const db = database(":memory:");
  await migrate(db);
  await seed(db);
  let starts = 0,
    jobCalls = 0;
  const tasks = [];
  const handler = createVercelHandler({
    start: async () => {
      starts++;
      return { db, app: createApp(db) };
    },
    after: (p) => tasks.push(p),
    runJobs: async (_db, opts) => {
      assert.equal(opts.batchSize, 2);
      jobCalls++;
    },
  });
  const { server, base } = await listen(handler);
  try {
    const health = await fetch(base + "/api/index?__route=health").then((r) =>
      r.json(),
    );
    assert.equal(health.database, "connected");
    const r = await fetch(base + "/api/index?__route=auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "alex@smarttutor.test",
        password: "LearnTogether!26",
      }),
    });
    assert.equal(r.status, 200);
    await Promise.all(tasks);
    assert.equal(jobCalls, 1);
    const mail = await db("mail")
      .where({ recipient: "alex@smarttutor.test" })
      .orderBy("id", "desc")
      .first();
    const code = mail.body.match(/\b\d{6}\b/)[0];
    const otp = await fetch(base + "/api/index?__route=auth/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alex@smarttutor.test", code }),
    });
    assert.equal(otp.status, 200);
    const cookie = otp.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await fetch(base + "/api/index?__route=auth/me", {
          headers: { Cookie: cookie },
        }).then((r) => r.json())
      ).user.role,
      "student",
    );
    assert.equal(starts, 1);
    assert.equal(
      (await fetch(base + "/api/index?__route=admin/users")).status,
      401,
    );
    await Promise.all(tasks);
  } finally {
    await close(server);
    await db.destroy();
  }
});
test("bootstrap mail gets scheduled on the first read request", async () => {
  let calls = 0;
  const tasks = [];
  const { server, base } = await listen(
    createVercelHandler({
      start: async () => ({
        db: {},
        pendingBootstrap: true,
        app: (_q, r) => {
          r.statusCode = 200;
          r.end("{}");
        },
      }),
      after: (p) => tasks.push(p),
      runJobs: async () => calls++,
    }),
  );
  try {
    await fetch(base + "/api/index?__route=health");
    await Promise.all(tasks);
    await fetch(base + "/api/index?__route=health");
    await Promise.all(tasks);
    assert.equal(calls, 1);
  } finally {
    await close(server);
  }
});
test("failed initialization exposes no configuration details and can recover on the next request", async () => {
  let attempts = 0;
  const { server, base } = await listen(
    createVercelHandler({
      start: async () => {
        if (++attempts === 1)
          throw Object.assign(new Error("do-not-expose-secret"), {
            code: "TEST_CONFIGURATION",
          });
        return { db: {}, app: (_q, r) => r.end('{"status":"ok"}') };
      },
      after: () => {},
    }),
  );
  try {
    const bad = await fetch(base + "/api/index?__route=health");
    assert.equal(bad.status, 503);
    assert.equal((await bad.text()).includes("do-not-expose-secret"), false);
    assert.equal((await fetch(base + "/api/index?__route=health")).status, 200);
  } finally {
    await close(server);
  }
});

test("production initialization accepts complete separate database fields", async () => {
  const db = database(":memory:");
  const env = {
    NODE_ENV: "production",
    APP_URL: "https://smarttutor.test",
    DB_HOST: "database.example.test",
    DB_PORT: "4000",
    DB_USER: "prefix.root",
    DB_PASSWORD: "synthetic-private-value",
    DB_NAME: "test",
    DB_SSL: "true",
  };
  try {
    await initialize({
      env,
      makeDatabase: (_file, configuration) => {
        assert.equal(configuration, env);
        return db;
      },
    });
    assert.equal((await db("subjects")).length, 6);
    assert.equal((await db("users")).length, 0);
  } finally {
    await db.destroy();
  }
});
