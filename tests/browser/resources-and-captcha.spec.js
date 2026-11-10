import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { login } from "./helpers";

test("tutor image upload rejects videos and opens a private image resource", async ({
  page,
}) => {
  await login(page, "elena");
  await page.goto("/dashboard/upload");
  await page
    .getByRole("button", { name: "Image (JPEG, PNG, WebP)", exact: true })
    .click();
  const title = "Image browser test " + Date.now();
  await page.getByLabel("Resource title").fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Revision diagram");
  const field = page.getByLabel(/Image \(maximum/);
  await field.setInputFiles({
    name: "video.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("video"),
  });
  await page
    .getByRole("button", { name: "Save resource", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Videos are not allowed");
  const buffer = await sharp({
    create: { width: 30, height: 30, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  await field.setInputFiles({
    name: "diagram.png",
    mimeType: "image/png",
    buffer,
  });
  await page
    .getByRole("button", { name: "Save resource", exact: true })
    .click();
  await expect(
    page.getByText("Saved successfully", { exact: true }),
  ).toBeVisible();
  const resources = await page.request
    .get("/api/my/tutorials")
    .then((r) => r.json());
  const resource = resources.find((r) => r.title === title);
  expect(resource.type).toBe("image");
  const result = await page.request.get(`/api/tutorials/${resource.id}/open`);
  expect(result.headers()["content-type"]).toBe("image/webp");
  await page.goto("/tutorials");
  await page.getByLabel("Format").selectOption("image");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

test("contact email and tutor upload controls fit a phone screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/contact");
  await expect(
    page.getByRole("link", { name: "aryalgaurav365@gmail.com" }),
  ).toHaveAttribute("href", "mailto:aryalgaurav365@gmail.com");
  await login(page, "elena");
  await page.goto("/dashboard/upload");
  await expect(
    page.getByRole("button", { name: "Save resource", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/tutor-upload-phone.png",
    fullPage: true,
  });
});

test("CAPTCHA uses explicit rendering and refreshes a consumed token after a rejected registration", async ({
  page,
}) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { demo: false, captchaSiteKey: "test-widget" } }),
  );
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
    window.widgetCount = 0;
    window.turnstile = {
      render(target, options) {
        window.widgetOptions = options;
        const count = ++window.widgetCount;
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Complete test verification';
        button.onclick = () => options.callback('test-token-' + count);
        target.appendChild(button); window.widgetTarget = target;
        return count;
      },
      remove() { window.widgetTarget?.replaceChildren(); }
    };
  `,
      }),
  );
  const tokens = [];
  await page.route("**/api/auth/register", async (route) => {
    tokens.push(route.request().postDataJSON().captcha);
    await route.fulfill({
      status: tokens.length === 1 ? 409 : 201,
      json:
        tokens.length === 1
          ? { error: "Please correct your details" }
          : { message: "Check your email" },
    });
  });
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Test Learner");
  await page.getByLabel("Username").fill("testlearner");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("learner@example.test");
  await page.getByLabel("Confirm email").fill("learner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("TestPassword!123");
  await page.getByLabel("Confirm password").fill("TestPassword!123");
  await page.getByLabel("Date of birth").fill("2000-01-01");
  await page.getByLabel("Home address (private)").fill("Test address");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Complete test verification" })
    .click();
  expect(await page.evaluate(() => window.widgetOptions.action)).toBe(
    "register",
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Please correct your details",
  );
  await page
    .getByRole("button", { name: "Complete test verification" })
    .click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect.poll(() => tokens.length).toBe(2);
  expect(tokens[0]).not.toBe(tokens[1]);
});

test("student rating form submits a completed session and displays the saved rating", async ({
  page,
}) => {
  await login(page, "alex");
  let rating = null;
  await page.route("**/api/sessions", (route) =>
    route.fulfill({
      json: [
        {
          id: 9001,
          tutor_id: 2,
          student_id: 1,
          student_name: "Alex",
          tutor_name: "Elena",
          subject: "Mathematics",
          status: "completed",
          starts_at: "2026-01-01T09:00:00Z",
          ends_at: "2026-01-01T10:00:00Z",
          review_rating: rating,
        },
      ],
    }),
  );
  await page.route("**/api/reviews", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.session_id).toBe(9001);
    rating = Number(body.rating);
    await route.fulfill({ status: 201, json: { message: "Review published" } });
  });
  await page.goto("/dashboard/sessions");
  await page.getByRole("button", { name: "Leave a review" }).click();
  await page
    .getByRole("combobox", { name: "Rating", exact: true })
    .selectOption("4");
  await page.getByLabel("Feedback").fill("Helpful explanations");
  await page.getByRole("button", { name: "Publish review" }).click();
  await expect(page.getByText("Rated 4/5 ★", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Leave a review" }),
  ).toHaveCount(0);
});
