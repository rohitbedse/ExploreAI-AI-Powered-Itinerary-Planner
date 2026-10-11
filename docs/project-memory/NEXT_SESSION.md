# NEXT_SESSION

_Written 2026-10-09 at the end of S3; S4 (verification audit, IMPLEMENTATION_STATUS §S4) confirmed this is still the right task: a live run saw Overpass return 504 three times in a row, so the cache + second Overpass URL below is the main demo-reliability fix. One task; do not bundle others._

## Task: cut latency and external-call load — in-process TTL cache for Photon + Overpass (and an Overpass fallback)

### Why
The core works end to end (IMPLEMENTATION_STATUS §S3), but the one live run took ~18 s, almost all of it the public Overpass call, and every request repeats identical geocode/search queries. Usage policies for Photon/Overpass also argue for not re-asking. Redis has no client yet, so start with a small in-process TTL cache behind the existing `PlaceSource` / `Geocoder` protocols.

### Inspect first
- `app/services/planning/places.py` (`OverpassClient.search`), `geocoding.py` (`PhotonGeocoder.geocode`), `builder.py` (shortlist/radius), `http.py`.
- `Settings.cache_default_ttl_seconds` (exists, unused).

### Steps
1. Wrapper classes `CachedPlaceSource` / `CachedGeocoder` (key = normalised text, or centre rounded to ~100 m + radius + sorted categories; TTL from settings; max size; cache only successes and genuine empty results, never errors).
2. Optional second Overpass URL tried once when the first fails/times out (config, no secrets).
3. Tests with a fake clock; confirm cache hits make zero HTTP calls and errors are not cached.
4. Re-run the live smoke once (see S3) and record the latency honestly.

### Still open / carried over
- Owner to confirm D8 (resolved by the assistant in S3), the D19 ambiguity rule, the D22 fixed UTC offset; D9 sequence; D11 (git init).
- OSRM never called live; walk/bike routers unconfigured (walking legs are labelled estimates).
- Never ran a live Gemini call: verify `GEMINI_MODEL` and the response schema.
- Not run: Playwright e2e (7 failing baseline, B1); browser look at the new "Price unknown" / notes UI.
- Later tasks: surface `explain_plan()` + clarification events; GET/save plan (the frontend rewrites the URL to `/plan/{id}`, which 501s on reload); revisions; persistence/auth.
