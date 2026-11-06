import "./config.js";
import { database, migrate } from "./db.js";
import { jobs } from "./jobs.js";
const db = database();
try {
  await migrate(db);
  await jobs(db);
} finally {
  await db.destroy();
}
