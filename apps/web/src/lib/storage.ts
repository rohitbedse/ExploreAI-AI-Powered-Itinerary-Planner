import type { PlanRequest } from "@/lib/types";

// Storage can throw (private mode, blocked cookies), so every access is guarded.
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const PENDING_KEY = "exploreai:pending-request";
const PLACE_KEY = "exploreai:place";
const RECENT_KEY = "exploreai:recent-places";
const MAX_RECENT = 5;

/** Hand-off from Home to /plan/new: the stream starts on the plan page. */
export const pendingRequest = {
  set: (req: PlanRequest) => safe(() => sessionStorage.setItem(PENDING_KEY, JSON.stringify(req)), undefined),
  peek: (): PlanRequest | null =>
    safe(() => {
      const raw = sessionStorage.getItem(PENDING_KEY);
      return raw ? (JSON.parse(raw) as PlanRequest) : null;
    }, null),
  clear: () => safe(() => sessionStorage.removeItem(PENDING_KEY), undefined),
};

/** A place the user picked by hand. Coordinates are optional (older/plain-text entries). */
export interface SavedPlace {
  name: string;
  lat?: number;
  lon?: number;
}

const isSavedPlace = (v: unknown): v is SavedPlace =>
  typeof v === "object" && v !== null && typeof (v as SavedPlace).name === "string";

/** The user's manual location choice; it beats browser geolocation and survives reloads. */
export const placeOverride = {
  get: (): SavedPlace | null =>
    safe(() => {
      const raw = localStorage.getItem(PLACE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return isSavedPlace(parsed) ? parsed : null;
    }, null),
  set: (place: SavedPlace) => safe(() => localStorage.setItem(PLACE_KEY, JSON.stringify(place)), undefined),
  clear: () => safe(() => localStorage.removeItem(PLACE_KEY), undefined),
};

export const recentPlaces = {
  get: (): SavedPlace[] =>
    safe(() => {
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isSavedPlace).slice(0, MAX_RECENT) : [];
    }, []),
  /** Most-recent-first, de-duplicated by name. Returns the updated list. */
  push: (place: SavedPlace): SavedPlace[] => {
    const next = [place, ...recentPlaces.get().filter((p) => p.name.toLowerCase() !== place.name.toLowerCase())].slice(
      0,
      MAX_RECENT,
    );
    safe(() => localStorage.setItem(RECENT_KEY, JSON.stringify(next)), undefined);
    return next;
  },
};
