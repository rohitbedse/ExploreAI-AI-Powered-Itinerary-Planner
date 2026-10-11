import { formatDuration } from "@/lib/format";

/**
 * Client-side "what did we understand?" preview. Pure regex, no network, never blocks submit.
 * It is a hint for the user, not the source of truth: the API's LLM does the real parsing.
 */
export interface ParsedPrompt {
  budget: { amount: number; label: string } | null;
  durationMin: number | null;
  durationLabel: string | null;
  group: { size: number | null; label: string } | null;
  moods: string[];
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const NUM = "(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";

const toNumber = (raw: string): number => {
  const word = NUMBER_WORDS[raw.toLowerCase()];
  return word ?? parseFloat(raw);
};

// ---- budget -----------------------------------------------------------------------------
const AMOUNT = "([\\d][\\d,]*(?:\\.\\d+)?)\\s*(k\\b)?";
const BUDGET_PREFIX = new RegExp(`(?:₹|\\brs\\.?|\\binr)\\s*${AMOUNT}`, "i");
const BUDGET_SUFFIX = new RegExp(`${AMOUNT}\\s*(?:₹|\\brupees?\\b|\\brs\\b\\.?|\\binr\\b)`, "i");
// "under 1500", "budget 800": needs a cue word, and must not be a time/people quantity.
const BUDGET_CUE = new RegExp(
  `\\b(?:under|below|within|upto|up to|max(?:imum)?|budget(?: of| is)?|around|about|only)\\s+${AMOUNT}(?!\\s*(?:h\\b|hr|hour|min|km|people|persons|pax|of us|friends|kids|am|pm))`,
  "i",
);

function amountFrom(m: RegExpMatchArray): number {
  const base = parseFloat(m[1].replace(/,/g, ""));
  return m[2] ? base * 1000 : base;
}

function parseBudget(text: string): ParsedPrompt["budget"] {
  const m = text.match(BUDGET_PREFIX) ?? text.match(BUDGET_SUFFIX) ?? text.match(BUDGET_CUE);
  if (!m) return null;
  const amount = amountFrom(m);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, label: `₹${amount.toLocaleString("en-IN")}` };
}

// ---- duration ---------------------------------------------------------------------------
const HOURS = new RegExp(`\\b${NUM}\\s*(?:hours?|hrs?|h)\\b(?:\\s*(?:and\\s*)?(\\d+)\\s*(?:minutes?|mins?)\\b)?`, "i");
const MINUTES = new RegExp(`\\b${NUM}\\s*(?:minutes?|mins?)\\b`, "i");

function parseDuration(text: string): number | null {
  if (/\bhalf[- ]?(?:a[- ])?day\b/i.test(text)) return 240;
  if (/\b(?:full|whole)[- ]day\b|\ball day\b/i.test(text)) return 480;
  if (/\bcouple of hours\b/i.test(text)) return 120;
  if (/\ba few hours\b/i.test(text)) return 180;
  if (/\b(?:an|one)[- ]hour\b/i.test(text)) return 60;

  const h = text.match(HOURS);
  if (h) {
    const mins = Math.round(toNumber(h[1]) * 60) + (h[2] ? parseInt(h[2], 10) : 0);
    return mins > 0 ? mins : null;
  }
  const m = text.match(MINUTES);
  if (m) {
    const mins = Math.round(toNumber(m[1]));
    return mins > 0 ? mins : null;
  }
  return null;
}

// ---- group ------------------------------------------------------------------------------
function parseGroup(text: string): ParsedPrompt["group"] {
  if (/\b(?:alone|solo|by myself|on my own|just me)\b/i.test(text)) return { size: 1, label: "Solo" };

  const family = text.match(new RegExp(`\\bfamily of ${NUM}\\b`, "i"));
  if (family) {
    const n = toNumber(family[1]);
    return { size: n, label: `Family of ${n}` };
  }
  if (/\bgroup of /i.test(text)) {
    const g = text.match(new RegExp(`\\bgroup of ${NUM}\\b`, "i"));
    if (g) return { size: toNumber(g[1]), label: `${toNumber(g[1])} people` };
  }
  const withFriends = text.match(new RegExp(`\\bwith ${NUM} (?:friends?|colleagues|cousins|siblings)\\b`, "i"));
  if (withFriends) {
    const n = toNumber(withFriends[1]) + 1; // "with 3 friends" = you + 3
    return { size: n, label: `${n} people` };
  }
  const people = text.match(new RegExp(`\\b${NUM} (?:people|persons|pax|adults|of us)\\b`, "i"));
  if (people) return { size: toNumber(people[1]), label: `${toNumber(people[1])} people` };

  if (/\b(?:date night|my date|a date|partner|girlfriend|boyfriend|wife|husband|spouse|couple|two of us)\b/i.test(text)) {
    return { size: 2, label: "Couple" };
  }
  if (/\bfamily\b/i.test(text)) return { size: null, label: "Family" };
  if (/\b(?:friends|group|gang|colleagues)\b/i.test(text)) return { size: null, label: "Friends" };
  return null;
}

// ---- mood -------------------------------------------------------------------------------
const MOODS: [label: string, pattern: RegExp][] = [
  ["Relaxing", /\b(?:relax\w*|calm|peaceful|chill\w*|quiet|slow|unwind|serene)\b/i],
  ["Romantic", /\b(?:romantic|romance|date night|candle\w*)\b/i],
  ["Adventurous", /\b(?:advent\w*|thrill\w*|trek\w*|hik\w*|exciting)\b/i],
  ["Foodie", /\b(?:food\w*|eat\w*|dinner|lunch|breakfast|brunch|cafe|café|coffee|dessert)\b/i],
  ["Cultural", /\b(?:cultur\w*|museum\w*|heritage|history|historic\w*|temple\w*|art|gallery|galleries)\b/i],
  ["Lively", /\b(?:fun|lively|party|nightlife|energetic|buzz\w*)\b/i],
  ["Outdoorsy", /\b(?:nature|park|garden|green|outdoor\w*|lake|beach)\b/i],
  ["Scenic", /\b(?:photo\w*|scenic|sunset|sunrise|views?)\b/i],
  ["Shopping", /\b(?:shop\w*|market\w*|bazaar|mall)\b/i],
  ["Kid-friendly", /\b(?:kids?|children|toddler\w*|zoo|animals)\b/i],
];
const MAX_MOODS = 3;

function parseMoods(text: string): string[] {
  const found: string[] = [];
  for (const [label, pattern] of MOODS) {
    if (pattern.test(text)) found.push(label);
    if (found.length === MAX_MOODS) break;
  }
  return found;
}

export function parsePrompt(text: string): ParsedPrompt {
  const durationMin = parseDuration(text);
  return {
    budget: parseBudget(text),
    durationMin,
    durationLabel: durationMin === null ? null : formatDuration(durationMin),
    group: parseGroup(text),
    moods: parseMoods(text),
  };
}

export type DetectedTag = { key: string; kind: "budget" | "time" | "group" | "mood"; label: string };

/** Flatten a parse into display tags with stable keys (so React can animate each in/out). */
export function toTags(p: ParsedPrompt): DetectedTag[] {
  const tags: DetectedTag[] = [];
  if (p.budget) tags.push({ key: `budget:${p.budget.amount}`, kind: "budget", label: p.budget.label });
  if (p.durationLabel) tags.push({ key: `time:${p.durationMin}`, kind: "time", label: p.durationLabel });
  if (p.group) tags.push({ key: `group:${p.group.label}`, kind: "group", label: p.group.label });
  for (const m of p.moods) tags.push({ key: `mood:${m}`, kind: "mood", label: m });
  return tags;
}
