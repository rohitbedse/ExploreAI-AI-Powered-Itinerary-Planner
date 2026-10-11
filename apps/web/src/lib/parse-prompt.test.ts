import { describe, expect, it } from "vitest";
import { parsePrompt, toTags } from "./parse-prompt";

describe("parsePrompt: budget", () => {
  it.each([
    ["I have ₹500 and 3 hours", 500],
    ["rs. 1,500 for the evening", 1500],
    ["Rs 800 max", 800],
    ["about 2k rupees", 2000],
    ["1500 rupees please", 1500],
    ["under 1500", 1500],
    ["budget of 700", 700],
  ])("%s -> %d", (text, amount) => {
    expect(parsePrompt(text).budget?.amount).toBe(amount);
  });

  it("does not mistake hours or people for a budget", () => {
    expect(parsePrompt("under 3 hours").budget).toBeNull();
    expect(parsePrompt("budget 5 people").budget).toBeNull();
    expect(parsePrompt("around 4 pm").budget).toBeNull();
  });

  it("formats with Indian digit grouping", () => {
    expect(parsePrompt("₹150000").budget?.label).toBe("₹1,50,000");
  });
});

describe("parsePrompt: duration", () => {
  it.each([
    ["3 hours", 180],
    ["3h", 180],
    ["2.5 hrs", 150],
    ["1 hour 30 minutes", 90],
    ["45 min", 45],
    ["three hours", 180],
    ["half a day", 240],
    ["a full day", 480],
    ["a couple of hours", 120],
  ])("%s -> %d min", (text, minutes) => {
    expect(parsePrompt(text).durationMin).toBe(minutes);
  });

  it("labels durations like the rest of the app", () => {
    expect(parsePrompt("90 minutes").durationLabel).toBe("1 h 30 min");
  });

  it("returns null when no duration is present", () => {
    expect(parsePrompt("something relaxing").durationMin).toBeNull();
  });
});

describe("parsePrompt: group", () => {
  it.each([
    ["alone", 1, "Solo"],
    ["solo trip", 1, "Solo"],
    ["a date night", 2, "Couple"],
    ["family of four", 4, "Family of 4"],
    ["group of 6", 6, "6 people"],
    ["with 3 friends", 4, "4 people"],
    ["5 people", 5, "5 people"],
  ])("%s", (text, size, label) => {
    expect(parsePrompt(text).group).toEqual({ size, label });
  });

  it("recognises unnumbered groups", () => {
    expect(parsePrompt("with my family").group).toEqual({ size: null, label: "Family" });
    expect(parsePrompt("out with friends").group).toEqual({ size: null, label: "Friends" });
  });
});

describe("parsePrompt: mood + tags", () => {
  it("finds up to three moods", () => {
    const { moods } = parsePrompt("relaxing romantic adventurous foodie museum day");
    expect(moods).toHaveLength(3);
    expect(moods[0]).toBe("Relaxing");
  });

  it("builds stable, ordered tags for the headline example", () => {
    const tags = toTags(parsePrompt("I have ₹500 and 3 hours, alone, want something relaxing nearby"));
    expect(tags.map((t) => [t.kind, t.label])).toEqual([
      ["budget", "₹500"],
      ["time", "3 h"],
      ["group", "Solo"],
      ["mood", "Relaxing"],
    ]);
    expect(new Set(tags.map((t) => t.key)).size).toBe(tags.length);
  });

  it("returns nothing for empty or unrelated text", () => {
    expect(toTags(parsePrompt(""))).toEqual([]);
    expect(toTags(parsePrompt("zzz qqq"))).toEqual([]);
  });
});
