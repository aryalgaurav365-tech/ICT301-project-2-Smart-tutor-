import "./config.js";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initialize } from "./runtime.js";
import { jobs } from "./jobs.js";
const { db, app } = await initialize();
const web = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../web/dist",
);
app.use(express.static(web));
app.get("/{*path}", (req, res) => res.sendFile(path.join(web, "index.html")));
let busy = false;
const timer = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    await jobs(db);
  } catch (e) {
    console.error("Background job failed:", e.message);
  } finally {
    busy = false;
  }
}, 30000);
timer.unref();
const server = app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log("SmartTutor API listening on port " + (process.env.PORT || 3001)),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(async () => {
      await db.destroy();
      process.exit(0);
    });
  });
