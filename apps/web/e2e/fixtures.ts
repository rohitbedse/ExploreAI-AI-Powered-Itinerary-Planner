import type { Page, Route } from "@playwright/test";

// The API is a different origin (:8000), so mocked responses need CORS headers.
const CORS = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type, accept",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const stop = (id: string, name: string, hour: number, cost: number, lat: number, lon: number) => ({
  id,
  name,
  category: "cafe",
  location: { lat, lon },
  start: `2026-01-10T${String(hour).padStart(2, "0")}:00:00+05:30`,
  duration_min: 60,
  cost,
  rating: 4.4,
  why: `${name} fits a relaxed, low-cost outing.`,
});

export const leg = {
  from_stop_id: "s1",
  to_stop_id: "s2",
  mode: "walk",
  distance_m: 650,
  duration_min: 9,
  geometry: [
    [77.6, 12.97],
    [77.61, 12.975],
  ],
};

export function makePlan(totalCost: number) {
  return {
    id: "p_1",
    title: "A slow afternoon in Indiranagar",
    prompt: "relaxing, ₹500, 3 hours",
    stops: [stop("s1", "Cubbon Park Walk", 15, 0, 12.976, 77.592), stop("s2", "Third Wave Coffee", 16, totalCost, 12.979, 77.64)],
    legs: [leg],
    summary: { total_cost: totalCost, currency: "INR", total_duration_min: 129, total_travel_min: 9 },
    created_at: "2026-01-10T09:00:00Z",
    saved: false,
  };
}

const sse = (events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

export function planStream(totalCost: number) {
  const plan = makePlan(totalCost);
  return sse([
    { type: "status", step: "understanding", message: "Understanding request..." },
    { type: "status", step: "finding_places", message: "Finding places..." },
    { type: "stop", stop: plan.stops[0], leg_from_previous: null },
    { type: "status", step: "checking_routes", message: "Checking routes..." },
    { type: "stop", stop: plan.stops[1], leg_from_previous: leg },
    { type: "complete", plan },
  ]);
}

/** Fulfil an API route with CORS handling, answering the preflight automatically. */
export async function fulfill(route: Route, body: string | object | null, status = 200, contentType = "application/json") {
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  return route.fulfill({
    status,
    headers: CORS,
    contentType,
    body: body === null ? "" : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const photonFeature = (name: string, lon: number, lat: number, id: number) => ({
  geometry: { coordinates: [lon, lat] },
  properties: { name, osm_id: id, osm_type: "R", state: "State", country: "India" },
});

/**
 * Stub everything the app touches except the plan routes, so tests never hit the network.
 * Photon: reverse geocoding always resolves to Bengaluru (matches the configured geolocation);
 * search returns Pune / Pune-adjacent results for queries containing "pun". Returns the search
 * queries seen so tests can assert on debouncing.
 */
export async function stubBackground(page: Page) {
  const searches: string[] = [];
  await page.route("https://tiles.openfreemap.org/**", (r) => r.abort());
  await page.route("**/api/v1/auth/me", (r) => fulfill(r, { detail: "Not authenticated" }, 401));
  await page.route("https://photon.komoot.io/reverse*", (r) =>
    r.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ features: [photonFeature("Bengaluru", 77.5946, 12.9716, 1)] }),
    }),
  );
  await page.route("https://photon.komoot.io/api/*", (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    searches.push(q);
    const features = q.toLowerCase().includes("pun")
      ? [photonFeature("Pune", 73.8553, 18.5196, 2), photonFeature("Pune Cantonment", 73.88, 18.5, 3)]
      : [];
    return r.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ features }),
    });
  });
  return { searches };
}

/** App alerts only: Next.js' route announcer also has role="alert". */
export const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
