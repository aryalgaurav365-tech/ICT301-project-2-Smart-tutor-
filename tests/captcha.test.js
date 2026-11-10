import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyCaptcha } from "../apps/api/src/captcha.js";
const env = {
  CAPTCHA_SECRET: "private-test-secret",
  APP_URL: "https://smarttutor.example",
};
test("CAPTCHA rejects missing tokens without contacting the provider and fails closed on network errors", async () => {
  await assert.rejects(
    verifyCaptcha("", env, () => {
      throw new Error("should not call");
    }),
    { status: 400 },
  );
  await assert.rejects(
    verifyCaptcha("test-token", env, async () => {
      throw new Error("private-secret");
    }),
    (e) => e.status === 503 && !e.message.includes("private-secret"),
  );
});
test("CAPTCHA binds successful tokens to registration and the deployed hostname; provider replay rejections remain rejected", async () => {
  const result = {
    success: true,
    hostname: "smarttutor.example",
    action: "register",
  };
  await verifyCaptcha("test-token", env, async (url, options) => {
    assert.equal(options.body.get("secret"), env.CAPTCHA_SECRET);
    assert.equal(options.body.get("response"), "test-token");
    assert.equal(options.redirect, "error");
    return Response.json(result);
  });
  for (const invalid of [
    { ...result, success: false, "error-codes": ["timeout-or-duplicate"] },
    { ...result, hostname: "wrong.example" },
    { ...result, action: "other" },
  ])
    await assert.rejects(
      verifyCaptcha("test-token", env, async () => Response.json(invalid)),
      { status: 400 },
    );
});
