import { expect, test } from "@playwright/test";
import { alerts, fulfill, makePlan, planStream, stubBackground } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await stubBackground(page);
});

test("home: example chip fills the prompt and empty submit is validated", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const prompt = page.getByLabel("What are you in the mood for?");
  // The CTA is soft-disabled while empty, so validation is exercised with a too-short prompt.
  await prompt.fill("ab");
  await prompt.press("Control+Enter");
  await expect(alerts(page)).toContainText("at least 3 characters");
  await expect(prompt).toHaveAttribute("aria-invalid", "true");

  await page.getByRole("group", { name: "Example prompts" }).getByRole("button").first().click();
  await expect(prompt).toHaveValue(/₹500 and 3 hours/);

  // Geolocation is granted in config and Photon is stubbed, so the chip resolves to the detected city.
  await expect(page.getByRole("button", { name: /Location: Bengaluru/ })).toBeVisible();
});

test("plan: streams live, renders timeline + summary, and revises via a quick chip", async ({ page }) => {
  let sentBody: { prompt: string; location?: { lat: number } } | undefined;

  await page.route("**/api/v1/plans/stream", (route) => {
    sentBody = route.request().postDataJSON();
    return fulfill(route, planStream(350), 200, "text/event-stream");
  });
  await page.route("**/api/v1/plans/p_1/revise/stream", (route) => {
    const body = route.request().postDataJSON();
    expect(body.action).toBe("cheaper");
    const cheaper = { type: "complete", plan: makePlan(120) };
    return fulfill(route, `data: ${JSON.stringify(cheaper)}\n\n`, 200, "text/event-stream");
  });

  await page.goto("/");
  await page.getByLabel("What are you in the mood for?").fill("Relaxing afternoon, 3 hours, ₹500");
  await expect(page.getByRole("button", { name: /Location: Bengaluru/ })).toBeVisible();
  await page.getByRole("button", { name: "Plan my day" }).click();

  // Final state: URL swapped to the permanent id, both stops, leg and summary present.
  await expect(page).toHaveURL(/\/plan\/p_1$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A slow afternoon in Indiranagar");
  const itinerary = page.getByRole("list", { name: "Itinerary" });
  await expect(itinerary.getByRole("article")).toHaveCount(2);
  await expect(itinerary).toContainText("9 min walk");
  const summary = page.getByRole("region", { name: "Plan summary" });
  await expect(summary).toContainText("₹350");
  await expect(summary).toContainText("2 h 9 min");

  // The request carried the typed prompt and detected coordinates.
  expect(sentBody?.prompt).toBe("Relaxing afternoon, 3 hours, ₹500");
  expect(sentBody?.location?.lat).toBeCloseTo(12.9716, 3);

  // "Why this pick" tooltip: opens on focus, closes on Escape.
  const why = itinerary.getByRole("button", { name: /Why we picked Cubbon Park Walk/ });
  await why.focus();
  await expect(page.getByRole("tooltip")).toContainText("relaxed");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  // Swap needs a selected stop.
  const swap = page.getByRole("button", { name: "Swap this stop" });
  await expect(swap).toBeDisabled();
  await itinerary.getByRole("button", { name: "Third Wave Coffee", exact: true }).click();
  await expect(swap).toBeEnabled();

  // Quick change: the revised plan replaces the summary.
  await page.getByRole("button", { name: "Cheaper" }).click();
  await expect(summary).toContainText("₹120");
});

test("plan: a failed stream shows an alert with retry", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/v1/plans/stream", (route) => {
    calls++;
    return calls === 1
      ? fulfill(route, { detail: "Planner is busy" }, 503)
      : fulfill(route, planStream(350), 200, "text/event-stream");
  });

  await page.goto("/");
  await page.getByLabel("What are you in the mood for?").fill("anything relaxing please");
  await page.getByRole("button", { name: "Plan my day" }).click();

  await expect(alerts(page)).toContainText("Planner is busy");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("list", { name: "Itinerary" }).getByRole("article")).toHaveCount(2);
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("map lives in a toggleable bottom sheet", async ({ page }) => {
    await page.route("**/api/v1/plans/p_1", (route) => fulfill(route, makePlan(350)));
    await page.goto("/plan/p_1");

    const toggle = page.getByRole("button", { name: "Show map" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(page.getByRole("button", { name: "Hide map" })).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Show map" })).toBeVisible();
  });
});

test("login: validates fields before calling the API", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in", exact: true }).last().click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
});
