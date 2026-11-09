import { waitUntil } from "@vercel/functions";
import { initialize } from "./runtime.js";
import { jobs } from "./jobs.js";
export function routedUrl(raw) {
  const url = new URL(raw, "https://function.internal");
  const route = url.searchParams.get("__route");
  url.searchParams.delete("__route");
  if (route !== null) {
    const segments = route.split("/");
    if (
      segments.some((s) => !s || s === "." || s === "..") ||
      !segments.every((s) => /^[a-zA-Z0-9_-]+$/.test(s))
    )
      throw new Error("Invalid API route");
    url.pathname = "/api/" + segments.join("/");
  }
  if (!url.pathname.startsWith("/api/")) throw new Error("Invalid API route");
  return (
    url.pathname +
    (url.searchParams.size ? "?" + url.searchParams.toString() : "")
  );
}
export function createVercelHandler({
  start = initialize,
  after = waitUntil,
  runJobs = jobs,
} = {}) {
  let ready;
  const load = () =>
    (ready ??= start().catch((e) => {
      ready = undefined;
      throw e;
    }));
  return async (req, res) => {
    try {
      req.url = routedUrl(req.url);
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid API route" }));
      return;
    }
    let runtime;
    try {
      runtime = await load();
    } catch (e) {
      console.error("API initialization failed:", e.code || e.name);
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Retry-After", "30");
      res.end(
        JSON.stringify({
          error: "Service temporarily unavailable. Please try again shortly.",
        }),
      );
      return;
    }
    // Await the HTTP response and register work while the function is active.
    await new Promise((resolve, reject) => {
      res.once("finish", () => {
        if (
          (runtime.pendingBootstrap ||
            ["POST", "PATCH", "DELETE"].includes(req.method)) &&
          res.statusCode < 400
        ) {
          runtime.pendingBootstrap = false;
          after(
            Promise.resolve()
              .then(() =>
                runJobs(runtime.db, { batchSize: 2, deadlineMs: 40000 }),
              )
              .catch((e) =>
                console.error("Mail job failed:", e.code || e.name),
              ),
          );
        }
        resolve();
      });
      res.once("close", resolve);
      try {
        runtime.app(req, res);
      } catch (e) {
        reject(e);
      }
    });
  };
}
