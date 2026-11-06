import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./helpers";
test("student edits their profile and explores real analytics", async ({
  page,
}) => {
  await login(page, "alex");
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Alex Morgan");
  await page
    .getByLabel("About you")
    .fill("Building confidence, one question at a time.");
  await page
    .getByLabel("Profile subjects")
    .selectOption({ label: "Mathematics" });
  await page.getByRole("button", { name: "Update profile" }).click();
  await expect(
    page.getByText("Profile updated", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("About you")).toHaveValue(
    "Building confidence, one question at a time.",
  );
  await page.getByRole("link", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sessions over time" }),
  ).toBeVisible();
  await page.getByText("View chart data as a table").click();
  await expect(
    page.getByRole("columnheader", { name: "Sign-ins" }),
  ).toBeVisible();
});
test("tutor saves, edits and publishes an unpublished draft", async ({
  page,
}) => {
  await login(page, "elena");
  await page.getByRole("link", { name: "My resources" }).click();
  const title = "Draft practice " + Date.now();
  await page.getByLabel("Resource title", { exact: true }).fill(title);
  await page
    .getByLabel("Subject", { exact: true })
    .selectOption({ label: "Mathematics" });
  await page
    .getByLabel("Description", { exact: true })
    .fill("A draft lesson for future learners.");
  await page
    .getByLabel("HTTPS resource URL")
    .fill("https://www.khanacademy.org/math/algebra");
  await page.getByLabel("Publication").selectOption("draft");
  await page
    .getByRole("button", { name: "Save resource", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const row = page
    .locator(".session-row")
    .filter({ has: page.getByRole("heading", { name: title }) });
  await row.getByRole("button", { name: "Edit draft" }).click();
  await page.getByLabel("Draft title").fill(title + " revised");
  await page
    .getByRole("dialog", { name: "Edit resource draft" })
    .getByLabel("Status")
    .selectOption("published");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/tutorials");
  await expect(
    page.getByRole("heading", { name: title + " revised" }),
  ).toBeVisible();
});
test("admin tools show safe audit and delivery metadata, not email bodies", async ({
  page,
}) => {
  await login(page, "admin");
  await page.getByRole("link", { name: "Admin tools" }).click();
  await expect(
    page.getByRole("heading", { name: "Invite an administrator" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Email deliveries" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Administrative activity" }),
  ).toBeVisible();
  await expect(page.getByText(/Your login code is/)).toHaveCount(0);
});
test("primary public pages meet automated WCAG A/AA checks", async ({
  page,
}) => {
  for (const url of ["/", "/tutors", "/tutorials", "/login", "/contact"]) {
    await page.goto(url);
    await page.locator("header").waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      url,
    ).toEqual([]);
  }
});

test("sensitive-action dialog supports keyboard focus and escape", async ({
  page,
}) => {
  await login(page, "admin");
  await page.getByRole("link", { name: "Admin tools" }).click();
  await page
    .getByRole("button", { name: "Confirm identity for sensitive actions" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Confirm your identity" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Confirm identity", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Confirm identity for sensitive actions",
    }),
  ).toBeFocused();
});
