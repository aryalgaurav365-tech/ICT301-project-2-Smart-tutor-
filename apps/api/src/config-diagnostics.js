const settings = [
  "INITIAL_ADMIN_EMAIL",
  "BREVO_API_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "MAIL_FROM",
];

// Only setting names and availability are recorded. Never log their values.
export function deploymentConfigStatus(env = process.env) {
  return {
    settings: Object.fromEntries(
      settings.map((name) => [
        name,
        env[name] === undefined
          ? "missing"
          : String(env[name]).trim()
            ? "present"
            : "empty",
      ]),
    ),
    similarAdminEmailKeys: Object.keys(env)
      .filter((name) => {
        const normalized = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
        return (
          name !== "INITIAL_ADMIN_EMAIL" &&
          name.length <= 64 &&
          normalized.startsWith("INIT") &&
          normalized.includes("ADMIN") &&
          normalized.endsWith("EMAIL")
        );
      })
      .slice(0, 5)
      .map((name) =>
        name.replace(
          /[^\x21-\x7e]/gu,
          (character) => `\\u{${character.codePointAt(0).toString(16)}}`,
        ),
      ),
  };
}

export function logDeploymentConfig(
  stage,
  env = process.env,
  logger = console,
) {
  logger.info(
    `Deployment configuration (${stage}, values redacted): ${JSON.stringify(deploymentConfigStatus(env))}`,
  );
}
