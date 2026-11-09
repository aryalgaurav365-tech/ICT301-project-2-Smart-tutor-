import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deploymentConfigStatus,
  logDeploymentConfig,
} from "../apps/api/src/config-diagnostics.js";

test("deployment diagnostics distinguish absent, empty and present settings without disclosing values", () => {
  const env = {
    INITIAL_ADMIN_EMAIL: "private-owner@example.test",
    SMTP_HOST: "private-smtp.example.test",
    SMTP_PASSWORD: "private-password",
    SMTP_USER: " ",
    UNRELATED_SECRET: "private-unrelated-secret",
  };
  const lines = [];
  logDeploymentConfig("runtime", env, { info: (line) => lines.push(line) });
  const status = deploymentConfigStatus(env);
  assert.equal(status.settings.INITIAL_ADMIN_EMAIL, "present");
  assert.equal(status.settings.SMTP_PASSWORD, "present");
  assert.equal(status.settings.SMTP_USER, "empty");
  assert.equal(status.settings.SMTP_PORT, "missing");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes("private-"), false);
  assert.equal(lines[0].includes("UNRELATED_SECRET"), false);
  assert.equal(lines[0].includes("runtime"), true);
});

test("diagnostics expose spelling and invisible-character mistakes in key names without treating them as configuration", () => {
  const status = deploymentConfigStatus({
    "INITIAL_ADMIN_EMAIL\u200b": "private-owner@example.test",
    "INITIAL ADMIN EMAIL": "private-owner@example.test",
    INITIAL_ADMIN_EMAIL: "",
  });
  assert.equal(status.settings.INITIAL_ADMIN_EMAIL, "empty");
  assert.deepEqual(status.similarAdminEmailKeys, [
    "INITIAL_ADMIN_EMAIL\\u{200b}",
    "INITIAL\\u{20}ADMIN\\u{20}EMAIL",
  ]);
  assert.equal(JSON.stringify(status).includes("private-owner"), false);
});
