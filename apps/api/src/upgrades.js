// Incremental, additive migrations. Run one migration process during deployment.
export async function upgrades(db) {
  if (!(await db.schema.hasTable("schema_versions")))
    await db.schema.createTable("schema_versions", (t) => {
      t.string("version").primary();
      t.string("applied_at");
    });
  if (
    await db("schema_versions")
      .where({ version: "002-complete-workflows" })
      .first()
  )
    return;
  const column = async (table, name, add) => {
    if (!(await db.schema.hasColumn(table, name)))
      await db.schema.alterTable(table, add);
  };
  await column("users", "photo", (t) => t.string("photo"));
  await column("users", "timezone", (t) =>
    t.string("timezone").defaultTo("Australia/Sydney"),
  );
  await column("auth_sessions", "recent_until", (t) =>
    t.string("recent_until"),
  );
  await column("mail", "lease_until", (t) => t.string("lease_until"));
  await column("mail", "lease_token", (t) => t.string("lease_token"));
  await column("mail", "next_attempt_at", (t) => t.string("next_attempt_at"));
  await column("mail", "session_id", (t) =>
    t.integer("session_id").unsigned().references("id").inTable("sessions"),
  );
  await column("mail", "session_starts_at", (t) =>
    t.string("session_starts_at"),
  );
  const tables = {
    admin_invites: (t) => {
      t.increments();
      t.string("digest").unique();
      t.string("email");
      t.integer("created_by").unsigned().references("id").inTable("users");
      t.string("expires_at");
      t.string("used_at");
    },
    session_changes: (t) => {
      t.increments();
      t.integer("session_id").unsigned().references("id").inTable("sessions");
      t.integer("user_id").unsigned().references("id").inTable("users");
      t.string("kind");
      t.text("reason");
      t.string("starts_at");
      t.string("status").defaultTo("pending");
      t.text("resolution");
      t.string("created_at");
    },
  };
  for (const [name, define] of Object.entries(tables))
    if (!(await db.schema.hasTable(name)))
      await db.schema.createTable(name, define);
  await db("schema_versions").insert({
    version: "002-complete-workflows",
    applied_at: new Date().toISOString(),
  });
}
