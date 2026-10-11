import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration, formatMoney, formatPlanCost, formatStopCost } from "./format";

describe("format", () => {
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(135)).toBe("2 h 15 min");
  });

  it("formats distances", () => {
    expect(formatDistance(480)).toBe("480 m");
    expect(formatDistance(1530)).toBe("1.5 km");
  });

  it("formats money, calling zero Free", () => {
    expect(formatMoney(0)).toBe("Free");
    expect(formatMoney(1250)).toContain("1,250");
  });
});

describe("cost formatting keeps unknown separate from free", () => {
  it("shows unknown stop prices as unknown, zero as Free", () => {
    expect(formatStopCost(null)).toBe("Price unknown");
    expect(formatStopCost(undefined)).toBe("Price unknown");
    expect(formatStopCost(0)).toBe("Free");
  });
  it("labels partial totals as a lower bound and unknown totals as unknown", () => {
    const base = { total_cost: 0, currency: "INR" };
    expect(formatPlanCost({ ...base, cost_status: "unknown" })).toBe("Price unknown");
    expect(formatPlanCost({ ...base, cost_status: "known" })).toBe("Free");
    expect(formatPlanCost({ total_cost: 150, currency: "INR", cost_status: "partial" })).toMatch(/150\+$/);
  });
});
