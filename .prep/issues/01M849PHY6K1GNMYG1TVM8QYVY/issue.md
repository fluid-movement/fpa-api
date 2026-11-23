---
title: Sync from FullstackFreestyleTools instead of the old AWS services
kind: code
tags:
  - upstream
priority: high
---

Move fpa-api's upstream from the old AWS microservices to FullstackFreestyleTools (freestylejudge.com, Ryan's app), through a sync API that we add to that app ourselves and submit as a PR. fpa-api stays as our middleware: consumers (fpa-events, fpa-profiles) keep using fpa-api's own API, and fpa-api keeps merging fpa-profiles' export in place.

## Why

The old AWS services are being retired (FullstackFreestyleTools README, "Phase 2: Retire the old system"). The new public Points API (`/api/v1/points/*`) was built for ResultsRender only: players carry just a name, `getAllResults` lists divisions without any placements, and ranking history before the cut-over is not there yet. fpa-api's placements, stats, alias merging and breakdowns cannot be fed from it.

## Plan

1. Fresh branch on our fork (`fluid-movement/FullstackFreestyleTools`), replacing the earlier consumer-shaped `claude/public-data-api` branch, which is not reused.
2. Add sync endpoints to FullstackFreestyleTools (draft below) and submit the PR to SmilesAir/FullstackFreestyleTools.
3. On this branch (`feature/new-api`): rewrite fpa-api's upstream layer and refresh scheduler against the sync API.
4. Switch production once the PR is merged and Ryan has migrated the historic data (asked; pending).

## Draft sync API (FullstackFreestyleTools, `/api/v1/sync/*`)

Public, read-only, through the app's existing `publicGet` helper (CORS, rate limits, CDN cache), counted under its own rate-limit name `sync`.

| Endpoint | Returns |
|---|---|
| `GET /api/v1/sync/manifest` | `{ formatVersion, generatedAt, players: { hash, count }, events: { [eventId]: hash } }`: every finished event and one hash for the player list |
| `GET /api/v1/sync/events?ids=a,b,…` (max 50) | Full finished events: `{ events: [{ id, name, startDate, endDate, fpaId, postName, divisions: [{ id, name, rounds: [{ number, pools: [{ pool, teams: [{ place, points, playerIds }] }] }] }] }] }` |
| `GET /api/v1/sync/players` | `{ players: [{ id, firstName, lastName, country, fpaWebsiteId, aliasId }] }` |
| existing `GET /api/v1/points/getManifest`, `downloadPointsData/{key}` | Rankings and ratings, unchanged |

fpa-api's loop: poll `sync/manifest` and `points/getManifest` (hourly, plus `POST /refresh`); fetch only events whose hash changed or that are new, in batches of 50; drop events that left the manifest; refetch players when their hash changed; fetch a ranking snapshot when a new key appears. First start: about 20 calls.

## Open questions

- **Which events count as finished?** No column says so. Proposed: not a test event, not `is_playing`, `end_date` before today, and every team in rounds 1+ of its visible divisions has a place. A pool lock is not usable: a missing `pools` row reads as unlocked, and the imported events have none.
- **Events hidden from the Rankings Generator** (`events.is_hidden`): include or leave out? The Points API includes them.
- **Hidden players**: leave them out of `sync/players`, or include them with a `hidden` flag so fpa-api decides? Teams can reference them.
- **fpa-api's `live` field and `CONSUME_IN_PROGRESS_EVENTS`**: remove, or keep `live` as an always-null field for compatibility with consumers?
- **Mapping in fpa-api**: map the sync payloads into the existing `Raw*` types (domain layer and its tests untouched), or change the normalizers to read the new types directly?
- **Ranking history**: comes with Ryan's historic data migration; confirm that it lands in `points_snapshots` so `downloadPointsData` serves it.
