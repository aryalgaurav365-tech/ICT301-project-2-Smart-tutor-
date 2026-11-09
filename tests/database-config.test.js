import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mysqlConnection,
  hasDatabaseConfig,
} from "../apps/api/src/database-config.js";
const fields = {
  DB_HOST: "database.example.test",
  DB_PORT: "4000",
  DB_USER: "prefix.root",
  DB_PASSWORD: "synthetic:@/#%+ space",
  DB_NAME: "test",
  DB_SSL: "true",
};
test("separate database fields preserve literal passwords and verified TLS", () => {
  const c = mysqlConnection(fields);
  assert.equal(c.password, fields.DB_PASSWORD);
  assert.equal(c.host, fields.DB_HOST);
  assert.equal(c.port, 4000);
  assert.equal(c.database, "test");
  assert.equal(c.ssl.rejectUnauthorized, true);
  assert.equal(c.ssl.minVersion, "TLSv1.2");
  assert.equal(c.ssl.ca, undefined);
  assert.equal(hasDatabaseConfig(fields), true);
});
test("partial configurations fail without logging values, and absent config keeps local development", () => {
  assert.equal(mysqlConnection({}), null);
  assert.equal(hasDatabaseConfig({}), false);
  const partial = { ...fields };
  delete partial.DB_PASSWORD;
  assert.equal(hasDatabaseConfig(partial), false);
  assert.throws(
    () => mysqlConnection(partial),
    (e) => e.code === "CONFIG_DATABASE" && !e.message.includes(fields.DB_USER),
  );
});
test("URL configuration still works and optional CA verification stays enabled", () => {
  const c = mysqlConnection({
    DATABASE_URL:
      "mysql://user:synthetic%40%3A%2F@database.example.test:4000/test",
    DB_SSL_CA: "SYNTHETIC_PUBLIC_CA",
  });
  assert.equal(c.password, "synthetic@:/");
  assert.equal(c.ssl.ca, "SYNTHETIC_PUBLIC_CA");
  assert.equal(c.ssl.rejectUnauthorized, true);
});
test("invalid ports and system databases are rejected before any connection is attempted", () => {
  for (const port of ["abc", "0", "65536"])
    assert.throws(
      () => mysqlConnection({ ...fields, DB_PORT: port }),
      (e) => e.code === "CONFIG_DATABASE",
    );
  for (const name of [
    "sys",
    "mysql",
    "information_schema",
    "performance_schema",
  ])
    assert.throws(
      () => mysqlConnection({ ...fields, DB_NAME: name }),
      (e) => e.code === "CONFIG_DATABASE",
    );
});

test("production connections require verified TLS even without an explicit DB_SSL flag", () => {
  const c = mysqlConnection({
    ...fields,
    DB_SSL: undefined,
    NODE_ENV: "production",
  });
  assert.equal(c.ssl.rejectUnauthorized, true);
  assert.throws(
    () => mysqlConnection({ DATABASE_URL: "synthetic-private-invalid-url" }),
    (e) =>
      e.code === "CONFIG_DATABASE" && !e.message.includes("synthetic-private"),
  );
});
