import nodemailer from "nodemailer";
import addressParser from "nodemailer/lib/addressparser/index.js";
import { z } from "zod";

const failure = (code, details = {}) =>
  Object.assign(new Error("Email provider request failed"), {
    code,
    ...details,
  });

export function mailTransport(env = process.env, request = fetch) {
  if (env.BREVO_API_KEY) {
    return {
      async sendMail({ from, to, subject, text }) {
        const addresses = addressParser(from || "");
        const sender = addresses[0];
        if (
          addresses.length !== 1 ||
          !z.email().safeParse(sender?.address).success ||
          !z.email().safeParse(to).success
        )
          throw failure("EMAIL_ADDRESS_CONFIG");
        let response;
        try {
          response = await request("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(10000),
            headers: {
              "api-key": env.BREVO_API_KEY,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              sender: {
                email: sender.address,
                ...(sender.name ? { name: sender.name } : {}),
              },
              to: [{ email: to }],
              subject,
              textContent: text,
            }),
          });
        } catch (error) {
          throw failure(
            error?.name === "TimeoutError" ? "ETIMEDOUT" : "BREVO_NETWORK",
          );
        }
        if (response.status !== 201) {
          // Do not retain provider response bodies; they can echo message data.
          const retry = response.headers.get("retry-after");
          const seconds = /^\d+$/.test(retry || "")
            ? Number(retry)
            : (Date.parse(retry) - Date.now()) / 1000;
          await response.body?.cancel();
          throw failure("BREVO_HTTP", {
            httpStatus: response.status,
            retryAfterMs: Number.isFinite(seconds)
              ? Math.max(0, Math.min(86400000, seconds * 1000))
              : 0,
          });
        }
        let result;
        try {
          result = await response.json();
        } catch {
          throw failure("BREVO_RESPONSE");
        }
        if (typeof result.messageId !== "string" || !result.messageId)
          throw failure("BREVO_RESPONSE");
        return { messageId: result.messageId };
      },
    };
  }
  if (!env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_PORT === "465",
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  });
}
