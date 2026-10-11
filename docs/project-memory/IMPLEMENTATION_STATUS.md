# ExploreAI — Implementation Status

_Audit 2026-10-09, then the backend-foundation session the same day. Sections 0–6 are the **audit snapshot**; where §S1/§S2 contradict them, the later section wins._

## S6. Example prompts failing with Gemini enabled (2026-10-11) — newest

- **Bug:** with `GEMINI_API_KEY` set, Gemini returns free-form interest labels ("relaxation", "animals", "walking", "indoor activities"); `match_categories` only matched exact keywords, so the home-page examples "Relaxing solo" (sometimes) and "Family fun" (always) ended with "I can't search for … yet". The rule-based fallback never hit this, which is why tests passed.
- **Fix:** `planning/builder.py` matches on a 5-letter root as well (relaxation ~ relaxing); `planning/places.py` keywords broadened (animals/wildlife -> zoo/aquarium, walking/peaceful -> park, indoor -> museum/gallery/cafe/cinema, date -> cafe/restaurant); when **no** interest matches, the default sightseeing mix is used and disclosed in `Plan.notes` instead of a hard error.
- **Checks:** pytest 235 passed (new parametrised matching tests; `test_unmapped_interest_is_reported_not_faked` updated to the new behaviour), ruff/format/mypy clean. Live against the user's running uvicorn: both example prompts streamed `complete` (Cubbon Park + 2 cafes; Bangalore Aquarium). Web checks not re-run (no web change).

## S5. Failure hunt (2026-10-11)

### Fixed
- **Flaky Playwright e2e in default parallel mode** (`apps/web/playwright.config.ts`): 3 failed per run (different tests each run). Trace showed `Test timeout of 30000ms exceeded` with `page.goto("/")` alone taking ~21 s: 6 workers (12 cores) saturated the single `next dev` server. Not a compile-on-first-hit issue: a route warm-up globalSetup was tried and changed nothing (removed). Raising the test timeout to 60 s just moved the failures to 10 s `toHaveURL` timeouts. Fix: `workers: process.env.CI ? undefined : 2`. Serial had been faster than default parallel (1.6 vs 1.8 min).
- **User report "We couldn't reach the planner"**: not a code bug. A real Chromium against the user's running servers showed every API call going to `localhost:8001` (ERR_CONNECTION_REFUSED) while uvicorn listened on 8000; `.next` bundles contained `NEXT_PUBLIC_API_URL = "http://localhost:8001"`, so the shell that launched `pnpm dev` had that variable set (not in repo, not a User/Machine env var). curl of the same request against :8000 streamed fine (ended with a clean Overpass "temporarily unavailable" error at that moment). Change: in development the message now names the URL (`use-plan-stream.ts`, `API_URL` exported from `lib/api/client.ts`); README troubleshooting note added. typecheck/lint/54 unit/22 e2e pass after.
- **README run step was broken**: line 51 contained a BEL control byte (`apps\x07pi`, i.e. `\a` was eaten), so the copied command was `cd appspi`. Now `cd apps\api`. README e2e note updated (no more `--workers=1`).

### Checks actually run
| Command | Result |
| --- | --- |
| pytest / ruff check / ruff format --check / mypy (apps/api) | 228 passed, 1 warning / clean / 51 formatted / Success |
| `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm types:check` | pass / clean / 54 passed / up to date |
| `npx playwright test` before fix (default workers) | 19 passed, 3 failed; `--workers=1`: 22 passed (1.6 min) |
| `npx playwright test` after fix, run twice | **22 passed (1.0 min)** both times |
| live: `uv run uvicorn app.main:app --port 8000`, `/api/v1/health`, POST `/plans/stream` (Bengaluru, cafe + park) | ok; 167 places, 3 stops, `complete` in 29 s (Overpass dominates) |

### Still open
- NEXT_SESSION task unchanged (Photon/Overpass TTL cache + Overpass fallback URL): the 29 s live latency confirms it.

## S4. Verification & integration audit (2026-10-09, after S3)

Goal: verify prompt -> places -> plan -> map end to end; fix real bugs. Not a git repo; nothing committed.

### Fixed
- **Map never displayed in the real app** (`apps/web/src/components/plan/plan-map.tsx`): maplibre's unlayered CSS (`.maplibregl-map{position:relative}`) overrode Tailwind v4's layered `absolute inset-0`, so the container had height 0 (canvas 546x300, nothing visible). Now an inline `position:absolute; inset:0`. Verified in headless Chromium against the live API: map 546x770, OpenFreeMap tiles, 3 numbered markers, OSM attribution.
- Two stale e2e tests (not app bugs): `smoke.spec.ts` clicked the soft-disabled empty CTA (now validates via a 2-char prompt + Ctrl+Enter); `home.spec.ts` navbar locator `"Plan"` also matched "Saved plans" (`exact: true`).

### Checks actually run
| Command | Result |
| --- | --- |
| `uv run --frozen pytest -q` / ruff check / ruff format --check / mypy (apps/api) | 226 passed, 1 warning / clean / 51 files formatted / Success (51 files) |
| `pnpm types:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` | up to date / pass / pass / 54 passed |
| `playwright test` (default parallel, `next dev`) | **8 passed, 14 failed** — dev-server first-compile timeouts under parallel workers, not logic failures |
| `playwright test --workers=1` (before the two test fixes) | 20 passed, 2 failed (the two stale tests above) |
| the two fixed tests, `--workers=1` | 2 passed. Full serial suite was not re-run after the fixes |

### Live external APIs actually exercised (public instances, no keys)
- Photon geocode (200), Overpass (167 unique places for Bengaluru; **also 3x HTTP 504 in one request -> clean "Place data is temporarily unavailable" error, no invented data**), OSRM public demo driving table + route (200; legs `source:"route"` with geometry), OpenFreeMap tiles in a browser.
- Real uvicorn + real `next dev` + real Chromium, no mocks: example prompt -> 3-stop plan in ~19-40 s (Overpass dominates) -> timeline + map. Budget ₹500 correctly ends `budget_status: unverified` (no price in OSM), cost shown "Price unknown", walking legs labelled estimates.
- Ambiguous place ("Indiranagar" alone) -> clarification listing candidates (D19 works). Coordinates without `city` and without "near me" -> asks where (D19, by design; the web client sends `city`).
- Not exercised: Gemini (no key), walk/bike OSRM, Open-Meteo (not used), Redis/Postgres (not used).

### Observed limitations (not changed)
- "a cafe and a park" can yield two near-identical cafes (24 m apart): the scheduler fills the time window with a soft repeat penalty (D21).
- "walk" is reported as "Not searched (no matching place type)" even though the plan is walking-based; harmless note, slightly confusing.
- Plans start "now"; at night parks may be closed — hours are unverified and labelled so.
- `/plans/{id}`, save, revise (Cheaper / Swap / Add activity buttons) all return 501: the UI shows these controls but they do not work. Requirement "swap/regenerate/save" is NOT met.
- Reloading `/plan/{id}` loses the plan (GET 501).
- Public Overpass is the demo risk: 504s and ~20-35 s latency, no mirror, no cache.

---

## S3. Deterministic core session (2026-10-09, after S2)

Goal: make a real request produce a feasible, source-backed itinerary. Not a git repo; nothing committed.

### Implemented (`apps/api/app/services/planning/`)
| Piece | File | Notes |
| --- | --- | --- |
| D8 contract change (nullable cost + provenance, cost/budget status, `Plan.notes`, `TravelLeg.source`) | `schemas/plans.py`, `explain.py` (never words an unknown price as a number) | types regenerated; web updated (`format.ts`, `timeline-card`, `plan-summary`, `saved-plans-list`, `plan-view`) |
| HTTP helper: bounded retry/backoff on 429/5xx/timeout/network, sanitised `UpstreamError` | `http.py` | no URL/body in errors |
| Photon geocoder: not-found, ambiguity, city hint, malformed-feature skipping | `geocoding.py` | D19 |
| Overpass client: bbox query, validation, normalisation, dedupe; OSM id/URL/attribution kept; `remark` runtime-error detection | `places.py` | D18; no fallback data exists |
| Opening-hours subset parser + entry-price parser (unknown stays unknown) | `facts.py` | PH/sunrise/etc. => unknown |
| OSRM table/route + labelled estimates | `routing.py` | D20 |
| Pure greedy scheduler | `scheduler.py` | D21 |
| `DeterministicPlanBuilder` (+ `build_stream` progress), `check_plan`, wiring | `builder.py`, `factory.py`, `main.py`, `pipeline.py` | D22, D23 |
| Settings + `.env.example` | `config.py` | `PLANNER_ENABLED`, `OVERPASS_URL`, `PHOTON_URL`, `OSRM_*`, `PLAN_UTC_OFFSET_MINUTES`, `OVERPASS_MAX_ELEMENTS`, `PIPELINE_TIMEOUT_SECONDS` |

### Tests actually run
| Command | Result |
| --- | --- |
| `uv run --frozen pytest -q` (apps/api) | **226 passed**, 1 warning (Starlette/httpx deprecation). New: `test_planning_providers.py`, `test_planning_core.py`, `test_planning_e2e.py`, helper `planning_support.py`. All provider traffic is `httpx.MockTransport`; payloads are hand-written, **not recordings** |
| `ruff check .` / `ruff format` / `mypy .` | clean / formatted / Success (51 files) |
| `pnpm types`, then `pnpm types:check` | regenerated; "up to date" |
| `pnpm typecheck`, `pnpm lint`, `pnpm test` | pass; 54 web tests (2 new in `format.test.ts`) |

### Verified live (manual, outside the test suite)
- Public Photon + Overpass: "Cubbon Park, Bengaluru" -> 47 candidates -> 3-stop plan; every stop a real OSM way with URL; prices unknown, hours unverified, legs estimated, all labelled in the plan. The first Overpass attempt used `around:` and hit a server-side query timeout (HTTP 200 + `remark`, no elements); the client correctly treated it as a failure; the query was then changed to a bbox, which worked (~18 s).
- Real uvicorn + `curl -N` on `/plans/stream`: frames arrive incrementally (status events seconds before the Overpass result). Intent came from the rule-based fallback (no Gemini key).

### Not verified
- OSRM was never called live (mocks only); walk/bike routers are unconfigured by default, so default walking plans use labelled estimates.
- No live Gemini call (S2 carry-over). Playwright e2e not run (baseline 7 failing, B1).
- Client disconnect over real HTTP not exercised (generator-level cancellation tests only).
- Opening-hours parser covers a subset of the OSM grammar; timezone is one fixed offset (D22).
- New cost/notes UI was type-checked and unit-tested for formatting, not viewed in a browser.

### Known limitations
- Public Overpass latency ~18 s observed; no cache yet (next task).
- Ranking = interest category + distance (OSM has no ratings). Visit lengths are per-category assumptions, disclosed in `Plan.notes`.
- Shortlist capped at 12 places; dense areas can hide better options.
- Still unimplemented: revisions, GET/save plan, auth, persistence; `explain_plan()` and clarification events are not surfaced.

---

## S2. LLM stages session (2026-10-09, after S1)

Owner asked for the three prompts (intent extraction, explanations, pipeline + SSE) "as far as possible". Not a git repo; nothing committed.

### Implemented (under `apps/api`)
| Feature | Where | Notes |
| --- | --- | --- |
| Intent schema: budget(amount,currency,per_person?), duration_min, group_size, interests[{label,source explicit/inferred}], location_text, near_user, transport, constraints, contradictions; `missing`/`clarifications` derived **by code**; unknown stays `None` (never 0/unlimited); location never invented | `app/schemas/intent.py` | essentials = location + duration; budget missing is surfaced but non-blocking |
| Gemini REST provider: header key, JSON mode + response schema, timeout, bounded exponential retry (429/5xx/timeout/network), sanitised `ProviderError` | `app/services/llm/gemini.py`, `base.py`, `prompt.py` | model name unverified, no live call made |
| Extractor: validate -> one repair retry -> next provider -> rule-based fallback (`source="fallback"`); objects with no known fields rejected; unknown keys dropped | `app/services/llm/extractor.py`, `fallback.py` | prompts/keys not logged (tested) |
| Settings: `GEMINI_API_KEY` (SecretStr, blank=None), `GEMINI_MODEL`, `LLM_MAX_RETRIES`, `LLM_TIMEOUT_SECONDS` (<=120), `PIPELINE_TIMEOUT_SECONDS`; default chain now `gemini` (others skipped) | `config.py`, `.env.example` | `PIPELINE_TIMEOUT_SECONDS` not yet in `.env.example` |
| Explanation service: LLM JSON output validated (known unique stop ids, every number must exist in plan/intent data, no links/control chars) else deterministic templated explanation; plan never mutated; place names sanitised and sent as delimited data | `app/services/explain.py`, `schemas/explanation.py` | **not wired into any route** (Plan contract has no field for it) |
| Pipeline + SSE: understanding -> clarification/error -> `PlanBuilder` -> stop events -> exactly one terminal event; plan re-validated before emit; overall timeout; generic error text (no internals); cancellation propagates | `app/services/pipeline.py`, `routers/plans.py`, `main.py` | wire format `data: {json}\n\n`, same event types as before |

### Blockers (not implemented — nothing exists)
Place retrieval (Overpass), geocoding, ranking, routing, deterministic scheduler, persistence. `app.state.plan_builder` is `None`, so a real request ends with the error event "Itinerary generation is not available yet...". **No end-to-end itinerary is produced.** The "user can submit and get an itinerary" and "final itinerary contains source-backed places" criteria are therefore NOT met; only the plumbing is. Test builders use fake plans purely as mock data.

### Tests actually run
| Command | Result |
| --- | --- |
| `uv run --frozen pytest -q` (apps/api) | **132 passed**, 1 warning (Starlette/httpx deprecation) — includes new `test_intent.py`, `test_explain.py`, `test_pipeline.py` |
| `ruff check .` / `ruff format` / `mypy .` | All checks passed / formatted / Success, 37 files |
| `pnpm types:check` | up to date (OpenAPI unchanged) |
| `pnpm typecheck`, `pnpm test` | pass; 52 passed (existing web tests already cover status/stop/complete/error reducer + SSE parser) |

### Not verified
- No live Gemini call; response shape, schema acceptance and model name are from memory.
- No live uvicorn/browser run of the SSE route; only TestClient (buffers the whole body, so real-time streaming and client-disconnect over HTTP are not exercised — cancellation is tested at the generator level).
- Playwright e2e not run (baseline 7 failing, B1). No new frontend code or tests were written; frontend handling of clarification text rests on the existing `error` handling.
- Rule-based fallback is regex-based and English-only; recall is low by design.

---

## S1. Backend foundation session (2026-10-09)

Scope done: backend foundation (stage 1). Stages 2–4 (Overpass/geocoding clients, routing, itinerary engine) were requested in the same prompt but **NOT started**. Directory is still not a git repository; nothing committed.

### Implemented (under `apps/api`)
| Feature | Where | Verified by |
| --- | --- | --- |
| Schemas split into a package; `from app.schemas import X` unchanged | `app/schemas/{plans,errors,health}.py` | tests, OpenAPI |
| Stricter validation: whitespace stripped on `PlanRequest`/`ReviseRequest`/`LoginRequest`; `city`/`instruction`/`stop_id` min length 1; `PlanSummary` numbers >= 0 and `currency` `^[A-Z]{3}$`; login email basic pattern; `ReviseRequest` needs `instruction` for `custom`, `stop_id` for `swap_stop` | `schemas/plans.py` | `tests/test_schemas.py` |
| Settings validation: enum normalisation, `log_level`/`log_format`, bounded `http_timeout_seconds` (0<x<=120) and `http_max_retries` (0..5), non-blank UA, non-empty CORS list, `*` CORS rejected, production rejects placeholder UA contact | `app/config.py` | `tests/test_config.py` |
| Structured logging (JSON/console), request id on every record, idempotent setup | `app/logging_config.py` | `tests/test_request_context.py` |
| Request-id middleware (pure ASGI): safe `X-Request-ID` accepted (`[A-Za-z0-9._-]{1,64}`) else uuid4 hex; echoed, exposed via CORS; access log; unhandled exceptions -> generic 500 | `app/middleware.py` | tests + live smoke |
| Error envelope `{detail:str, code, request_id?, errors?[{field,message,type}]}`; validation errors never echo input; `AppError` | `app/errors.py`, `schemas/errors.py` | `tests/test_errors.py` + smoke |
| `GET /api/v1/health` (unchanged shape) and new `GET /api/v1/ready` (200/503; lifecycle flag + pluggable `app.state.readiness_checks`, 2 s per-check timeout, no detail leakage) | `routers/health.py`, `services/readiness.py` | `tests/test_health.py` + smoke |
| OpenAPI: 422/500 documented as `ErrorResponse` (default `HTTPValidationError` no longer emitted), unique operation ids; shared TS types regenerated | `app/main.py`, `packages/shared/*` | tests; `pnpm types:check` |
| `.env.example`: added `LOG_FORMAT` | `.env.example` | read |

### Tests actually run (Windows)
| Command | Result |
| --- | --- |
| `uv run --frozen pytest -q` (apps/api) | **61 passed**, 1 warning (Starlette: TestClient with httpx deprecated) |
| `uv run --frozen ruff check .` | All checks passed |
| `uv run --frozen ruff format --check .` | 24 files already formatted |
| `uv run --frozen mypy .` | Success, 24 files |
| `pnpm types:check` | "Shared types are up to date" |
| `pnpm typecheck`, `pnpm lint`, `pnpm test` (run after type regeneration) | pass; pass (next-lint deprecation notice); 52 passed |
| Live smoke: venv `python -m uvicorn app.main:app --port 8765` | health 200, ready 200, POST /plans/stream `{"prompt":"x"}` 422 (envelope), GET /plans/abc 501, unknown route 404, custom `X-Request-ID` echoed. Process and temp logs removed afterwards. |

### Not verified / still open
- **Playwright e2e not re-run** after the contract/type change (baseline: 7 failing, B1).
- **Documented start command not run literally** (`make dev-api` / `uv run uvicorn app.main:app --reload --port 8000`): smoke used the venv python on port 8765 without `--reload`.
- Docker/compose build, CI, `next build`, pre-commit: not run.
- Production-mode JSON logs: formatter unit-tested, not observed from a live production-mode process.
- Request-id behaviour on SSE responses: untested (no SSE endpoint yet).
- Not implemented: rate limiting, security headers, auth, DB/Redis clients.
- Contract gaps C1–C3 (non-nullable `cost`, no provenance, no timezone/start time) deliberately **unchanged** (D8 still proposed).
- Stages 2–4 not started: no Overpass/geocoder client, routing client, scoring/scheduler. `Settings` still lacks `OVERPASS_URL`/`PHOTON_URL`/`NOMINATIM_URL`/`OSRM_URL`/LLM keys. All plan/auth endpoints still 501.

### Compatibility notes
- 404/405/422/501/500 bodies now carry extra fields (`code`, `request_id`, `errors`); `detail` is always a string (422 `detail` was an array before; `web/src/lib/api/client.ts` handles both).
- Whitespace-only prompts are now rejected (previously `"   "` passed `min_length`).

---

## Audit snapshot (2026-10-09, before S1)

Legend: **V** = verified by reading code or running a command this session. **A** = assumption / not verified.

## 0. Baseline checks actually run (Windows, PowerShell)
| Command (cwd) | Result |
| --- | --- |
| `uv run --frozen pytest` (apps/api) | **6 passed** (2 health, 4 schema), Python 3.12.14 |
| `uv run --frozen ruff check .` / `ruff format --check .` (apps/api) | pass / 12 files formatted |
| `uv run --frozen mypy .` (apps/api) | Success, 12 files |
| `pnpm typecheck` (root) | pass (shared + web) |
| `pnpm lint` (root) | pass, no ESLint warnings. `next lint` prints a deprecation notice (removed in Next 16) |
| `pnpm test` (root, vitest) | **52 passed**, 6 files |
| `pnpm types:check` (root) | "Shared types are up to date" (regenerates openapi.json/schema.d.ts; identical output) |
| `pnpm --filter @exploreai/web test:e2e` | **7 failed, 15 passed** (2.2 min) — see §3 B1 |
| `docker compose ... config` | **not validated**: no `.env` exists (only `.env.example`); error was "env file not found" |
| `next build`, `docker compose up/build`, `pre-commit`, CI | **not run** |
| `git status` | **impossible**: `D:\ExploreAI` is not a git repository |

Side effects of the audit: `test-results/` was overwritten by the Playwright run (gitignored artefacts); `apps/api/.pytest_cache` was refreshed. No source files were changed.

## 0b. Session log (audit session, 2026-10-09)
- Task: audit only (acceptance: inspect repo, run safe baselines, produce the five project-memory docs, prioritized plan). Result: **passed** — all five docs created; baselines run and reported above; no application code, dependency, or architecture change.
- Created: `docs/project-memory/{PROJECT_BRIEF,ARCHITECTURE,IMPLEMENTATION_STATUS,DECISIONS,NEXT_SESSION}.md` (and the `docs/` directories). Modified/deleted: none by hand.
- Incidental tool artefacts: `apps/web/test-results/` rewritten by Playwright; `apps/api/.pytest_cache` (and likely `.ruff_cache`/`.mypy_cache`) refreshed; `pnpm types:check` rewrote `packages/shared/*` with identical content (checked: reported up to date). All are gitignored or unchanged.
- Git: not a repository, so no changes could be diffed and nothing was committed.
- Unverified: CI itself, Docker builds/compose, `next build`, the cause of 6 of 7 e2e failures, whether the dependency pins are current.

## 1. What currently works (V)
- Web UI: home page (prompt composer, location chip with geolocation + Photon search, example cards, parse preview, theme toggle), plan page (streamed timeline, skeletons, progress steps, summary, revise bar, bottom-sheet map on mobile, MapLibre map with markers + route line, error + retry), saved list, login form with client validation. Exercised only against **mocked** API responses.
- SSE client: parser (chunk-split, CRLF, comments), event reducer, abort/cancel — unit tested (`sse.test.ts`, `plan-stream.test.ts`).
- Shared-type pipeline FastAPI → OpenAPI → TS, drift check.
- API: app factory, CORS, `/api/v1/health`, schema models with bounds validation, OpenAPI export.
- Tooling: ruff + mypy strict + pytest-asyncio, ESLint, vitest, Playwright, pre-commit config, CI workflow definition (not executed here).
- Accessibility/attribution: footer + location chip carry "© OpenStreetMap contributors"; map uses compact MapLibre attribution control (A: tile attribution content depends on the style).

## 2. Incomplete / skeleton (V)
- **All plan and auth endpoints return 501.** The product's core (intent → places → schedule → routes → plan) does not exist.
- No LLM client, no Overpass/geocoder/routing/weather clients, no scheduler, cost model, scoring, validation of external responses, logging, retries.
- No DB schema/migrations/ORM; PostGIS only creates the extension. No Redis client. No auth/session/password code; no user store.
- `Settings` covers only: app_env, log_level, user agent, cors, database_url, redis_url, cache ttl, llm chain + timeout, http timeout/retries. Every other `.env.example` var (API keys, model names, OVERPASS/PHOTON/NOMINATIM/OSRM/ORS/OPEN_METEO URLs) is unread. `.env.example` header claims all variables are read by the API — false.
- API tests cover only health + schema validation. No router, contract, SSE, or integration tests.
- `/design` showcase page ships as a route (internal tool).

## 3. Bugs, inconsistencies, contract mismatches

### Bugs / failing checks
- **B1 (V)** 7 Playwright e2e tests fail on this machine (Playwright 1.63.0, `pnpm dev`): `home.spec.ts` lines 92 (gradient ring), 101 (CTA soft-disabled), 120 (example cards), 138 (card tilt), 160 (Photon popover), 251 (navbar scroll) and `smoke.spec.ts:8`. For `smoke.spec.ts:8` the cause is visible: the test clicks "Plan my day" while it is `aria-disabled="true"` (soft-disabled by design in `glow-button.tsx`), and Playwright's actionability check treats aria-disabled as "element is not enabled" and times out. The causes of the other six were **not** investigated (A: likely the same click-on-aria-disabled pattern for some; others unknown). CI would presumably fail the same way (A: CI not run). Either the tests need `{ force: true }`/another approach, or the component behaviour changed after the tests were written.
- **B2 (V)** `README` says `make dev` etc.; the Makefile needs `make`/Git Bash on Windows and `.env` created manually — no `.env` exists now.

### Architectural inconsistencies
- **A1 (V)** README diagram says "FastAPI + LangGraph" and a 5-stage LLM-centric pipeline (LLM re-rank + wording). LangGraph is not a dependency and the brief forbids it unless justified. Also the README's "LLM re-rank" step conflicts with "LLM is not the source of truth" unless constrained to ordering already-validated candidates.
- **A2 (V)** Browser calls Photon directly (`apps/web/src/lib/geocode.ts`, default `https://photon.komoot.io`). Contradicts README ("every outbound request sends HTTP_USER_AGENT", cache in Redis) and the module's own comment. Also `NEXT_PUBLIC_PHOTON_URL` is undocumented in `.env.example`, and `PHOTON_URL` (API-side) is unused.
- **A3 (V)** `API_INTERNAL_URL` is set in docker-compose for web but not referenced anywhere in web source.
- **A4 (V)** `allow_credentials=True` "for session cookie" but no session/auth exists; cookie settings (SameSite/Secure) for cross-origin :3000→:8000 are undecided.
- **A5 (V)** Client-side regex "parse preview" duplicates intent parsing; it hardcodes ₹/INR and Indian phrasing. Acceptable as a hint but can diverge from the server's real parse (no shared schema for intent).

### Contract gaps vs. product rules
- **C1 (V)** `PlanStop.cost: float` (required, ≥0) and `PlanSummary.total_cost` cannot express "price unknown". Brief says costs "when available" and unknown prices must not be claimed. The UI will render 0 / a number for unknown. Same for `PlanStop.rating` (OSM has no ratings; nullable but invites invention).
- **C2 (V)** No fields for provenance/verification: OSM id/type (only `osm_url`), opening-hours known/verified, travel-time source (routed vs estimated), warnings/assumptions list on `Plan`. `PlanStop.why` is required, i.e. an LLM/template string is mandatory on every stop.
- **C3 (V)** `PlanRequest` is only `prompt + location? + city?`; no timezone, start time/date, or structured constraints. The scheduler needs an absolute start time; `PlanStop.start` is a tz-aware datetime but nothing defines which timezone the server uses. Currency hard-defaulted to `"INR"` in the schema and `"INR"` fallback in `plan-view.tsx`.
- **C4 (V)** `TravelLeg.geometry` has `default_factory=list`, so the generated TS type is optional (`geometry?:`); web code defends with `?.`. Fine, but the contract is looser than it appears.
- **C5 (V)** Stream/endpoint types are consistent today (web types are generated from the schema; mocks in `e2e/fixtures.ts` match the models). No mismatch could be exercised against a real server because none exists. `isPlanStreamEvent` checks only the `type` discriminant — payload shape is trusted (no zod validation at the SSE trust boundary), and `apiFetch` casts JSON to `T` without validation.
- **C6 (V)** Plan lifecycle undefined: `GET /plans/{id}` and `POST /plans/{id}/save` imply server-side persistence of anonymous plans, but save requires auth (web handles 401). Where/for how long unsaved plans live is undecided.
- **C7 (V)** Streaming endpoints declare `-> None` with a 200 `text/event-stream` OpenAPI response; fine for now, but the real implementation must return a `StreamingResponse` with keep-alives, and error paths must emit an `error` event (client treats a stream ending without `complete` as an error).

## 4. Missing tests
- API: router/contract tests (501 behaviour is untested), config parsing, SSE framing, every future integration (Overpass/OSRM parsing with recorded fixtures, timeouts/retries/fallbacks), scheduler/cost/constraint unit tests, LLM output validation incl. malformed output, auth.
- Web: no component tests (all UI coverage is Playwright with mocks); `use-plan-stream`, `apiFetch`, `storage`, `use-plans` untested.
- Cross-cutting: no contract test that real API SSE output validates against `PlanStreamEvent`; docker-compose smoke test absent.

## 5. Dependency and environment risks
- `next lint` deprecated (removed in Next.js 16); `motion@^14` and `lucide-react@^0.475` pins are unusual/old (A: verify before upgrading; not checked).
- `apps/api/Dockerfile` uses `ghcr.io/astral-sh/uv:latest` (unpinned) and `python:3.12-slim`; web Dockerfile dev stage runs `pnpm install` without `--frozen-lockfile`.
- `generate-types.mjs` uses `execFileSync(..., {shell: true})` → Node DEP0190 warning (Node v24 locally; CI uses 22).
- Local Python on PATH is 3.10.0; the API requires 3.12 and works only through `uv` (V: uv resolved 3.12.14). Node v24.21 locally vs CI 22 / Docker 22.
- `next.config.ts` disables `standalone` on Windows, so the Windows build differs from Docker/CI.
- Public Overpass/Nominatim/OSRM instances have rate limits/fair-use policies; the OSRM demo server is documented as dev-only. Self-hosting or caching is a prerequisite for anything beyond a demo.
- Free-tier LLM model names in `.env.example` (e.g. `gemini-2.0-flash`) may be retired; model names are config (A: not verified live).
- No `.env`, no git repo, `myenv/` (a Python venv at the repo root, apparently unused, A) sits in the working tree. `apps/web/tsconfig.tsbuildinfo` and `test-results/` exist on disk; `.gitignore` covers them, but `myenv/` is **not** in `.gitignore`.
- Secrets: none found hardcoded (V: reviewed .env.example, config, compose; defaults are the dev DB password `exploreai`).

## 6. Recommended implementation sequence
1. **Housekeeping (small):** `git init` + baseline commit (owner approval); add root `CLAUDE.md`; fix/triage the 7 e2e failures; add `myenv/` to `.gitignore`; fix README (LangGraph, status) and `.env.example` header claim.
2. **Contract v1 fixes** (D8): nullable cost, provenance fields, timezone/start-time in request, warnings list; regenerate types; update web rendering ("price unknown") and e2e fixtures.
3. **Deterministic core with fixtures, no network:** domain models (`Place`, `Constraints`, `Candidate`), filter/score, cost model, scheduler with opening-hours-aware time math, plan validator. Heavy unit tests.
4. **Integrations behind small interfaces** with httpx timeouts, bounded retries, logging, recorded-response fixture tests: geocoder (API-side, replace browser Photon), Overpass, OSRM (with haversine fallback labelled "estimated").
5. **SSE endpoint `POST /plans/stream`** wiring the above, emitting status/stop/complete/error; contract test against `PlanStreamEvent`; in-memory plan store.
6. **LLM intent extraction** (Pydantic-validated, one retry, deterministic regex/default fallback); optional "why" text templated deterministically first.
7. **Persistence + Redis cache** (SQLAlchemy/asyncpg, Alembic, PostGIS queries), then **auth + saved plans + revise**.
8. Weather, rate-limit hardening, observability.
