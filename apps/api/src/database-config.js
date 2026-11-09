import fs from "node:fs";
const fields = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
export function hasDatabaseConfig(env = process.env) {
  return (
    !!env.DATABASE_URL ||
    fields.every(
      (name) => typeof env[name] === "string" && env[name].length > 0,
    )
  );
}
export function mysqlConnection(env = process.env) {
  const anyFields = fields.some((name) => env[name] !== undefined);
  if (!env.DATABASE_URL && !anyFields) return null;
  let connection;
  if (env.DATABASE_URL) {
    let url;
    try {
      url = new URL(env.DATABASE_URL);
    } catch {
      throw Object.assign(new Error("DATABASE_URL must be a valid MySQL URL"), {
        code: "CONFIG_DATABASE",
      });
    }
    if (!["mysql:", "mysql2:"].includes(url.protocol))
      throw Object.assign(
        new Error("Use a MySQL-compatible database connection"),
        { code: "CONFIG_DATABASE" },
      );
    connection = {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
    };
  } else {
    if (!hasDatabaseConfig(env))
      throw Object.assign(
        new Error(
          "DB_HOST, DB_USER, DB_PASSWORD and DB_NAME must all be configured",
        ),
        { code: "CONFIG_DATABASE" },
      );
    connection = {
      host: env.DB_HOST,
      port: Number(env.DB_PORT || 3306),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
    };
  }
  if (
    !Number.isInteger(connection.port) ||
    connection.port < 1 ||
    connection.port > 65535
  )
    throw Object.assign(new Error("DB_PORT must be a valid port number"), {
      code: "CONFIG_DATABASE",
    });
  if (
    ["sys", "mysql", "information_schema", "performance_schema"].includes(
      connection.database.toLowerCase(),
    )
  )
    throw Object.assign(
      new Error("Choose an application database rather than a system database"),
      { code: "CONFIG_DATABASE" },
    );
  if (env.DB_SSL === "true" || env.DB_SSL_CA || env.DB_SSL_CA_FILE) {
    connection.ssl = {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      ...(env.DB_SSL_CA
        ? { ca: env.DB_SSL_CA }
        : env.DB_SSL_CA_FILE
          ? { ca: fs.readFileSync(env.DB_SSL_CA_FILE, "utf8") }
          : {}),
    };
  }
  return connection;
}
