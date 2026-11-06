import { expect } from "@playwright/test";
export async function login(page, name) {
  await page.goto("/login");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(name + "@smarttutor.test");
  await page.getByLabel("Password", { exact: true }).fill("LearnTogether!26");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Six-digit code")).toBeVisible();
  const mails = await page.request.get("/api/dev/mail").then((r) => r.json());
  const code = mails
    .find(
      (m) =>
        m.recipient === name + "@smarttutor.test" &&
        m.subject.includes("sign-in"),
    )
    .body.match(/\b\d{6}\b/)[0];
  await page.getByLabel("Six-digit code").fill(code);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/dashboard/);
}
