export async function verifyCaptcha(token, env = process.env, request = fetch) {
  const fail = (status, message) => {
    throw Object.assign(new Error(message), { status });
  };
  if (!env.CAPTCHA_SECRET)
    fail(503, "Registration awaits CAPTCHA configuration");
  if (typeof token !== "string" || !token || token.length > 2048)
    fail(400, "Complete CAPTCHA verification");
  let result;
  try {
    const response = await request(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: env.CAPTCHA_SECRET,
          response: token,
        }),
      },
    );
    if (!response.ok) throw new Error("Unavailable");
    result = await response.json();
  } catch {
    fail(503, "Verification is temporarily unavailable. Please try again.");
  }
  if (
    !result.success ||
    result.hostname !== new URL(env.APP_URL).hostname ||
    result.action !== "register"
  )
    fail(
      400,
      "CAPTCHA verification expired or failed. Please complete it again.",
    );
}
