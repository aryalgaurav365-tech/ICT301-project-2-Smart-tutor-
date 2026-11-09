import { database, migrate } from "./db.js";
import { createApp } from "./app.js";
import { bootstrapAdmin } from "./bootstrap.js";
import { hasDatabaseConfig } from "./database-config.js";
import { logDeploymentConfig } from "./config-diagnostics.js";
// The same app runs behind a Node listener or a Vercel function.
export async function initialize({
  env = process.env,
  makeDatabase = database,
  makeApp = createApp,
} = {}) {
  if (env.NODE_ENV === "production" || env.VERCEL)
    logDeploymentConfig("runtime", env);
  if ((env.NODE_ENV === "production" || env.VERCEL) && !hasDatabaseConfig(env))
    throw Object.assign(
      new Error(
        "Configure DATABASE_URL or all individual DB connection fields for deployment",
      ),
      { code: "CONFIG_DATABASE" },
    );
  if (env.NODE_ENV === "production" || env.VERCEL) {
    if (!env.APP_URL && env.VERCEL_PROJECT_PRODUCTION_URL)
      env.APP_URL = "https://" + env.VERCEL_PROJECT_PRODUCTION_URL;
    if (!env.APP_URL || new URL(env.APP_URL).protocol !== "https:")
      throw Object.assign(
        new Error("APP_URL must be the public HTTPS origin"),
        { code: "CONFIG_APP_URL" },
      );
  }
  const db = makeDatabase(undefined, env);
  try {
    await migrate(db);
    const pendingBootstrap = await bootstrapAdmin(db, env);
    return {
      pendingBootstrap,
      db,
      app: makeApp(db, {
        production: env.NODE_ENV === "production" || !!env.VERCEL,
        proxyHops: env.TRUST_PROXY ?? (env.VERCEL ? 1 : 0),
      }),
    };
  } catch (e) {
    await db.destroy();
    throw e;
  }
}
