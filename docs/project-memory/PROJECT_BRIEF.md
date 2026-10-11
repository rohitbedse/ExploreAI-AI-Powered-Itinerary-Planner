# ExploreAI — Project Brief

_Last updated: 2026-10-09 (audit session). Source: the engineering brief supplied by the user + README.md._

## Product goal
Users describe time, budget, location, interests and preferences in natural language. ExploreAI returns a realistic itinerary: **real places**, estimated travel times, costs **when available**, and a map.

## Stack (intended)
| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15, TypeScript, MapLibre |
| Backend | Python 3.12, FastAPI, Pydantic v2 |
| DB | PostgreSQL + PostGIS |
| Cache (planned) | Redis |
| Data | OSM Overpass, Photon/Nominatim, OSRM (or similar), optional Open-Meteo |
| LLM | Intent extraction + optional explanations only |
| Streaming | SSE |
| Ops | Docker Compose, GitHub Actions CI |

## Non-negotiable principles
1. Modular monolith, no microservices.
2. Deterministic Python for filtering, constraints, costs, scheduling, route validation.
3. LLM = intent extraction + optional wording. Never the source of truth for places, prices, travel times.
4. Never invent venues; never present unknown prices/hours/facts as verified.
5. Validate every external API response and LLM output.
6. Timeouts, bounded retries, logging, graceful fallbacks on every integration.
7. No LangGraph, vector DB, queues, Kubernetes unless a concrete requirement justifies it. No unnecessary abstractions/deps.

## Engineering rules (summary)
Inspect before editing; keep API contracts; small reviewable changes; meaningful tests; no secrets in code; never claim tests passed unless run; no commit/push/destructive git without explicit authorization; keep docs aligned with reality.

## Session protocol
Start: read CLAUDE.md (if present), README, this folder; check git status; verify docs against the repo. End: run checks, report, update these files, write NEXT_SESSION.md, never mark incomplete work complete.

## Open questions for the product owner
- Target launch region? Defaults assume India (INR, Bengaluru in tests/fixtures).
- Is login/saved-plans in MVP scope, or is anonymous generate-and-view enough first?
