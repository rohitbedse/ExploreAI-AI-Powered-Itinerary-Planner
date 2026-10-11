import { expect, test, type Page } from "@playwright/test";
import { fulfill, planStream, stubBackground } from "./fixtures";

const HEADLINE_PROMPT = "I have ₹500 and 3 hours, alone, want something relaxing nearby";

const textbox = (page: Page) => page.getByLabel("What are you in the mood for?");
const detected = (page: Page) => page.getByRole("status", { name: "Detected from your request" });

test.beforeEach(async ({ page }) => {
  await stubBackground(page);
});

test.describe("hero", () => {
  test("shows the pill, headline, subtext and the floating cards on desktop", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("AI day planner · 100% real places")).toBeVisible();
    // Animated words are aria-hidden; the heading's accessible name is one clean sentence.
    await expect(page.getByRole("heading", { level: 1, name: "Plan a day out in seconds." })).toBeVisible();
    await expect(page.getByText(/timed, costed, mapped itinerary/)).toBeVisible();

    const cards = page.locator(".float-card");
    await expect(cards).toHaveCount(5);
    await expect(cards.first()).toBeVisible();
    await expect(page.getByText("☕ Café · ₹180")).toBeVisible();
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("hides the floating cards", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator(".float-card").first()).toBeHidden();
    });
  });

  test("reduced motion: no ambient animations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const name = await page.locator(".float-card").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe("none");
  });
});

test.describe("prompt box", () => {
  test("typewriter placeholder runs while empty and stops once you type", async ({ page }) => {
    await page.goto("/");
    const caret = page.locator(".caret");
    await expect(caret).toBeVisible();
    // Text appears progressively: wait until some of it has been typed.
    await expect(page.locator("form span[aria-hidden='true']:has(.caret)")).toHaveText(/\w{4,}/, { timeout: 8000 });

    await textbox(page).fill("hello there");
    await expect(caret).toHaveCount(0);
  });

  test("parsing preview pops in budget, time, group and mood tags", async ({ page }) => {
    await page.goto("/");
    await textbox(page).fill(HEADLINE_PROMPT);

    const tags = detected(page);
    await expect(tags).toContainText("₹500");
    await expect(tags).toContainText("3 h");
    await expect(tags).toContainText("Solo");
    await expect(tags).toContainText("Relaxing");

    // Removing the budget removes its tag.
    await textbox(page).fill("3 hours, alone, relaxing");
    await expect(tags).not.toContainText("₹500");
    await expect(tags).toContainText("3 h");
  });

  test("helper text and counter follow what you type; Ctrl/Cmd+Enter hint is shown as keys", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Mention budget, time, who's coming and the vibe.")).toBeVisible();

    await textbox(page).fill("ab");
    await expect(page.getByText("Keep going…")).toBeVisible();

    await textbox(page).fill("a quiet walk somewhere");
    await expect(page.getByText("Add a budget or how long you have for a sharper plan.")).toBeVisible();
    await expect(page.getByText("22/1000")).toBeVisible();

    await textbox(page).fill(HEADLINE_PROMPT);
    await expect(page.getByText("Looks good. Ready when you are.")).toBeVisible();
    await expect(page.locator("kbd")).toHaveCount(2);

    await textbox(page).fill("x".repeat(950));
    await expect(page.getByText("50 characters left.")).toBeVisible();
  });

  test("gradient ring intensifies on focus", async ({ page }) => {
    await page.goto("/");
    const opacity = () =>
      page.locator(".prompt-glow").evaluate((el) => getComputedStyle(el, "::before").opacity);
    expect(Number(await opacity())).toBeLessThan(0.8);
    await textbox(page).focus();
    await expect.poll(async () => Number(await opacity())).toBeGreaterThan(0.95);
  });

  test("CTA: soft-disabled with a tooltip while empty, enabled after typing, Ctrl+Enter submits", async ({ page }) => {
    await page.route("**/api/v1/plans/stream", (r) => fulfill(r, planStream(350), 200, "text/event-stream"));
    await page.goto("/");

    const cta = page.getByRole("button", { name: "Plan my day" });
    await expect(cta).toHaveAttribute("aria-disabled", "true");
    await cta.hover();
    await expect(page.getByRole("tooltip")).toContainText("Describe your plan first");
    await expect(cta).toHaveAccessibleDescription("Describe your plan first");

    await textbox(page).fill("relaxing evening, ₹300");
    await expect(cta).not.toHaveAttribute("aria-disabled", "true");

    await textbox(page).press("Control+Enter");
    await expect(page).toHaveURL(/\/plan\/p_1$/);
  });
});

test.describe("example cards", () => {
  test("render as a grid of four with badges, and clicking types the prompt into the box", async ({ page }) => {
    await page.goto("/");
    const group = page.getByRole("group", { name: "Example prompts" });
    const cards = group.getByRole("button");
    await expect(cards).toHaveCount(4);
    for (const title of ["Relaxing solo", "Rainy date", "Family fun", "Photo walk"]) {
      await expect(group.getByText(title, { exact: true })).toBeVisible();
    }
    await expect(cards.first()).toContainText("₹500");
    await expect(cards.first()).toContainText("3 h");

    await cards.nth(2).click();
    // The text arrives over a short typing animation, then settles on the full prompt.
    await expect(textbox(page)).toHaveValue("Family of four, 4 hours, kids love animals, budget ₹2000");
    await expect(detected(page)).toContainText("Family of 4");
    await expect(detected(page)).toContainText("₹2,000");
  });

  test("cards tilt toward the pointer", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("group", { name: "Example prompts" }).getByRole("button").first();
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
    await expect
      .poll(() => card.evaluate((el) => el.style.getPropertyValue("--ry")))
      .not.toBe("");
    const ry = parseFloat(await card.evaluate((el) => el.style.getPropertyValue("--ry")));
    expect(ry).toBeGreaterThan(2); // pointer on the right edge tilts positively
  });
});

test.describe("location", () => {
  test("shows the detected city with a pulsing dot", async ({ page }) => {
    await page.goto("/");
    const chip = page.getByRole("button", { name: /Location: Bengaluru/ });
    await expect(chip).toBeVisible();
    await expect(chip.locator(".pulse-dot")).toBeVisible();
  });

  test("popover: debounced Photon search, keyboard selection, recents, request payload", async ({ page }) => {
    const { searches } = await stubBackground(page);
    let body: { city?: string; location?: { lat: number } } | undefined;
    await page.route("**/api/v1/plans/stream", (r) => {
      body = r.request().postDataJSON();
      return fulfill(r, planStream(350), 200, "text/event-stream");
    });
    await page.goto("/");

    await page.getByRole("button", { name: /Location: Bengaluru/ }).click();
    const dialog = page.getByRole("dialog", { name: "Choose location" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/OpenStreetMap/)).toBeVisible(); // attribution

    const search = dialog.getByRole("combobox", { name: "Search for a city" });
    await expect(search).toBeFocused();
    await search.pressSequentially("Pun", { delay: 40 }); // fast typing => one request
    const options = dialog.getByRole("option");
    await expect(options).toHaveCount(2);
    expect(searches.filter((q) => q.length > 0)).toEqual(["Pun"]);

    await search.press("ArrowDown");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await search.press("Enter");

    await expect(dialog).toBeHidden();
    const chip = page.getByRole("button", { name: /Location: Pune/ });
    await expect(chip).toBeFocused(); // focus returns to the trigger
    await expect(chip).toContainText("Pune");

    // Recents list the pick next time.
    await chip.click();
    await expect(page.getByRole("group", { name: "Recent places" })).toContainText("Pune");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await textbox(page).fill("something relaxing please");
    await page.getByRole("button", { name: "Plan my day" }).click();
    await expect(page).toHaveURL(/\/plan\/p_1$/);
    expect(body?.city).toBe("Pune");
    expect(body?.location?.lat).toBeCloseTo(18.5196, 3);
  });

  test("popover: 'Use my current location' returns to the detected city", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Location: Bengaluru/ }).click();
    await page.getByRole("combobox").fill("Pune");
    await page.getByRole("option").first().click();
    await expect(page.getByRole("button", { name: /Location: Pune/ })).toBeVisible();

    await page.getByRole("button", { name: /Location: Pune/ }).click();
    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByRole("button", { name: /Location: Bengaluru/ })).toBeVisible();
  });
});

test.describe("below the fold", () => {
  test("how it works shows three steps and the trust strip", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: "How it works" }).scrollIntoViewIfNeeded();
    const steps = page.locator("#how-title").locator("xpath=ancestor::section").getByRole("listitem");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText("Describe");
    await expect(steps.nth(1)).toContainText("We search real places");
    await expect(steps.nth(2)).toContainText("Get a timed route");

    // The connecting line draws itself once scrolled into view.
    const line = page.locator("section[aria-labelledby='how-title'] div[aria-hidden='true']").first();
    await expect
      .poll(() => line.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a))
      .toBeGreaterThan(0.95);

    const strip = page.getByRole("list", { name: "Why you can trust ExploreAI" });
    await strip.scrollIntoViewIfNeeded();
    await expect(strip).toContainText("Powered by OpenStreetMap");
    await expect(strip).toContainText("No ads");
    await expect(strip).toContainText("Free");
  });

  test("footer carries the OpenStreetMap attribution", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("ExploreAI");
    await expect(footer.getByRole("link", { name: "© OpenStreetMap contributors" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
  });
});

test.describe("navbar", () => {
  test("shrinks when scrolled and the underline follows the current page", async ({ page }) => {
    await page.goto("/");
    const bar = page.locator(".header-bar");
    await expect(bar).toHaveAttribute("data-scrolled", "false");
    const before = (await bar.boundingBox())!.height;

    const plan = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Plan", exact: true });
    await expect(plan).toHaveAttribute("aria-current", "page");
    const indicator = page.locator(".nav-indicator");
    await expect(indicator).toHaveCSS("opacity", "1");
    const x0 = (await indicator.boundingBox())!.x;

    await page.mouse.wheel(0, 900);
    await expect(bar).toHaveAttribute("data-scrolled", "true");
    await expect.poll(async () => (await bar.boundingBox())!.height).toBeLessThan(before - 6);

    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Saved plans" }).click();
    await expect(page).toHaveURL(/\/saved$/);
    await expect(page.getByRole("link", { name: "Saved plans" }).first()).toHaveAttribute("aria-current", "page");
    await expect.poll(async () => (await indicator.boundingBox())!.x).toBeGreaterThan(x0 + 20);
  });

  test("theme toggle morphs the icon and switches theme", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /Switch to (dark|light) mode/ });
    const wasDark = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
    await toggle.click();
    await expect
      .poll(() => page.locator("html").evaluate((el) => el.classList.contains("dark")))
      .toBe(!wasDark);
    await expect(toggle.locator("svg")).toHaveAttribute("data-dark", String(!wasDark));
    // Persisted for the next visit.
    const stored = await page.evaluate(() => localStorage.getItem("exploreai:theme"));
    expect(stored).toBe(wasDark ? "light" : "dark");
  });
});
