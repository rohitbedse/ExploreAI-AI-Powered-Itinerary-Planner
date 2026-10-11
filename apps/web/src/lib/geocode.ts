import { z } from "zod";

/**
 * Photon (Komoot) geocoding over OpenStreetMap data. Usage-policy notes:
 *  - call sites debounce (use-place-search) and require >= 2 characters;
 *  - results are cached in memory, reverse lookups also in sessionStorage;
 *  - in-flight requests are aborted when superseded;
 *  - a browser can't set a User-Agent, so production should route these through the API
 *    (which sends HTTP_USER_AGENT and caches in Redis). NEXT_PUBLIC_PHOTON_URL repoints this.
 * Results must be shown with "© OpenStreetMap contributors".
 */
const PHOTON_URL = process.env.NEXT_PUBLIC_PHOTON_URL ?? "https://photon.komoot.io";
const TIMEOUT_MS = 6000;

export interface Place {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
}

const featureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    osm_id: z.number().optional(),
    osm_type: z.string().optional(),
    name: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
  }),
});
const responseSchema = z.object({ features: z.array(featureSchema) });

/** Validate Photon GeoJSON and map it to places, dropping nameless and duplicate entries. */
export function photonToPlaces(json: unknown): Place[] {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of parsed.data.features) {
    const { name, state, country, osm_id, osm_type } = f.properties;
    if (!name) continue;
    const [lon, lat] = f.geometry.coordinates;
    const subtitle = [state, country].filter((s): s is string => Boolean(s) && s !== name).join(", ");
    const dedupe = `${name}|${subtitle}`.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ id: `${osm_type ?? "x"}${osm_id ?? `${lat},${lon}`}`, name, subtitle, lat, lon });
  }
  return out;
}

const cache = new Map<string, Place[]>();
const CACHE_MAX = 60;

function remember(key: string, value: Place[]) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
}

async function photon(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<Place[]> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(`${PHOTON_URL}${path}?${params}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
  return photonToPlaces(await res.json());
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const params = new URLSearchParams({ q, limit: "6", lang: "en" });
  params.append("layer", "city");
  params.append("layer", "locality");
  const places = await photon("/api/", params, signal);
  remember(key, places);
  return places;
}

/** Nearest city/locality for a coordinate, cached per ~1 km cell for the session. */
export async function reversePlace(lat: number, lon: number, signal?: AbortSignal): Promise<Place | null> {
  const key = `exploreai:rev:${lat.toFixed(2)},${lon.toFixed(2)}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached) as Place;
  } catch {
    /* storage unavailable: fall through to the network */
  }
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), limit: "1", lang: "en" });
  params.append("layer", "city");
  params.append("layer", "locality");
  const [place] = await photon("/reverse", params, signal);
  if (!place) return null;
  try {
    sessionStorage.setItem(key, JSON.stringify(place));
  } catch {
    /* ignore */
  }
  return place;
}
