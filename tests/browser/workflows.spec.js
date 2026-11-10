import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("public search and mobile layout render without client errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your potential/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("What would you like to learn?").fill("Mathematics");
  await page
    .getByRole("button", { name: "Search tutors", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Elena Brooks" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Marcus Chen" })).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("student submits a request for administrator assignment", async ({
  page,
}) => {
  await login(page, "alex");
  await page.goto("/book");
  const tutors = await page.request.get("/api/tutors").then((r) => r.json()),
    t = tutors.find((t) => t.name === "Elena Brooks"),
    sessions = await page.request.get("/api/sessions").then((r) => r.json());
  const slot = t.availability.find(
    (a) =>
      !sessions.some(
        (s) =>
          s.status === "scheduled" &&
          s.starts_at <
            new Date(+new Date(a.starts_at) + 3600000).toISOString() &&
          s.ends_at > a.starts_at,
      ),
  );
  await page
    .getByLabel("Your preferred tutor", { exact: true })
    .selectOption(String(t.id));
  await page
    .getByLabel("Subject", { exact: true })
    .selectOption(String(t.subjects[0].id));
  const d = new Date(slot.starts_at);
  await page
    .getByLabel("Preferred date and time (your local time)")
    .fill(
      new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    );
  await page
    .getByLabel("What would you like to work on?")
    .fill("Browser test algebra request");
  await page.getByRole("button", { name: "Send session request" }).click();
  await expect(
    page.getByRole("heading", { name: "Your request is in good hands." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View my sessions" }).click();
  await expect(
    page.getByText("Browser test algebra request").first(),
  ).toBeVisible();
});
test("administrator can view users and assign pending requests", async ({
  page,
}) => {
  await login(page, "admin");
  await page.getByRole("link", { name: "People & approvals" }).click();
  await expect(
    page.getByRole("cell", { name: "Elena Brooks elena@smarttutor.test" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Assign session" }).first().click();
  await expect(
    page.getByText("Session updated", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mathematics", exact: true }).first(),
  ).toBeVisible();
});
test("tutor publishes a resource from the real form", async ({ page }) => {
  await login(page, "elena");
  await page.getByRole("link", { name: "My resources" }).click();
  const title = "Browser-tested algebra " + Date.now();
  await page.getByLabel("Resource title").fill(title);
  await page
    .getByLabel("Subject", { exact: true })
    .selectOption({ label: "Mathematics" });
  await page
    .getByLabel("Description", { exact: true })
    .fill("Resource created through the tutor interface.");
  await page.getByLabel(/PDF \(maximum/).setInputFiles({
    name: "lesson.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF"),
  });
  await page.getByRole("button", { name: "Save resource" }).click();
  await expect(
    page.getByText("Saved successfully", { exact: true }),
  ).toBeVisible();
  await page.goto("/tutorials");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

test("assigned student and tutor exchange messages through their dashboards", async ({
  page,
  browser,
}) => {
  await login(page, "alex");
  await page.goto("/dashboard/sessions");
  await page.getByRole("link", { name: "Message tutor" }).first().click();
  const question = "Message test " + Date.now();
  await page.getByLabel("Message", { exact: true }).fill(question);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.locator(".message-history").getByText(question, { exact: true }),
  ).toBeVisible();
  const teacherContext = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
  });
  const teacher = await teacherContext.newPage();
  try {
    await teacher.goto("http://127.0.0.1:5173");
    await login(teacher, "elena");
    await teacher.goto("http://127.0.0.1:5173/dashboard/messages");
    await teacher.locator(".peers button").first().click();
    await expect(
      teacher.locator(".message-history").getByText(question, { exact: true }),
    ).toBeVisible();
    await teacher
      .getByLabel("Message", { exact: true })
      .fill("Tutor reply: " + question);
    await teacher
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page
        .locator(".message-history")
        .getByText("Tutor reply: " + question, { exact: true }),
    ).toBeVisible({ timeout: 10000 });
  } finally {
    await teacherContext.close();
  }
});
