import { describe, expect, it } from "vitest";
import { initialStreamState, streamReducer, type StreamAction, type StreamState } from "./plan-stream";
import type { Plan, PlanStop, TravelLeg } from "./types";

const stop = (id: string): PlanStop => ({
  id,
  name: `Stop ${id}`,
  category: "cafe",
  location: { lat: 12.9, lon: 77.6 },
  start: "2026-01-01T10:00:00+05:30",
  duration_min: 60,
  cost: 100,
  cost_source: "osm_tag",
  opening_hours_verified: false,
  rating: 4.5,
  why: "because",
});
const leg: TravelLeg = {
  from_stop_id: "a",
  to_stop_id: "b",
  mode: "walk",
  distance_m: 500,
  duration_min: 6,
  source: "estimate",
  geometry: [],
};
const plan: Plan = {
  id: "p1",
  title: "Plan",
  prompt: "x",
  stops: [stop("a"), stop("b")],
  legs: [leg],
  summary: {
    total_cost: 200,
    currency: "INR",
    cost_status: "known",
    unpriced_stops: 0,
    budget_status: "not_set",
    total_duration_min: 126,
    total_travel_min: 6,
  },
  notes: [],
  created_at: "2026-01-01T09:00:00Z",
  saved: false,
};

const run = (actions: StreamAction[], from: StreamState = initialStreamState) =>
  actions.reduce(streamReducer, from);

describe("streamReducer", () => {
  it("marks earlier steps done as new steps arrive", () => {
    const s = run([
      { type: "start" },
      { type: "event", event: { type: "status", step: "understanding", message: "Understanding..." } },
      { type: "event", event: { type: "status", step: "finding_places", message: "Finding places..." } },
    ]);
    expect(s.steps.map((x) => [x.key, x.status])).toEqual([
      ["understanding", "done"],
      ["finding_places", "active"],
    ]);
  });

  it("appends stops with their leg and ignores duplicate stop ids", () => {
    const ev = { type: "stop" as const, stop: stop("b"), leg_from_previous: leg };
    const s = run([{ type: "start" }, { type: "event", event: ev }, { type: "event", event: ev }]);
    expect(s.stops).toHaveLength(1);
    expect(s.legs).toHaveLength(1);
  });

  it("completes with the authoritative plan", () => {
    const s = run([
      { type: "start" },
      { type: "event", event: { type: "status", step: "writing", message: "Writing..." } },
      { type: "event", event: { type: "complete", plan } },
    ]);
    expect(s.phase).toBe("complete");
    expect(s.plan).toBe(plan);
    expect(s.steps.every((x) => x.status === "done")).toBe(true);
  });

  it("surfaces server errors and ignores events after a terminal state", () => {
    const s = run([
      { type: "start" },
      { type: "event", event: { type: "error", message: "boom" } },
      { type: "event", event: { type: "complete", plan } },
    ]);
    expect(s.phase).toBe("error");
    expect(s.error).toBe("boom");
    expect(s.plan).toBeNull();
  });

  it("treats a stream that closes early as an error, but not after completion", () => {
    expect(run([{ type: "start" }, { type: "end" }]).phase).toBe("error");
    const done = run([{ type: "start" }, { type: "event", event: { type: "complete", plan } }, { type: "end" }]);
    expect(done.phase).toBe("complete");
  });
});
