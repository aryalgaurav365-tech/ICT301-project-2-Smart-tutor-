import { database, migrate } from "./db.js";
import { createApp } from "./app.js";
import { bootstrapAdmin } from "./bootstrap.js";
// The same app runs behind a Node listener or a Vercel function.
export async function initialize({
  env = process.env,
  makeDatabase = database,
  makeApp = createApp,
} = {}) {
  if ((env.NODE_ENV === "production" || env.VERCEL) && !env.DATABASE_URL)
    throw Object.assign(
      new Error("DATABASE_URL must be configured for deployment"),
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
  const db = makeDatabase();
  try {
    await migrate(db);
    const pendingBootstrap = await bootstrapAdmin(db, env);
    return {
      pendingBootstrap,
      db,
      app: makeApp(db, {
        production: env.NODE_ENV === "production" || !!env.VERCEL,
      }),
    };
  } catch (e) {
    await db.destroy();
    throw e;
  }
}
