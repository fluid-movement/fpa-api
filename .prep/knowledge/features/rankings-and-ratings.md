---
type: feature
title: Rankings, ratings and snapshots
description: Tournament-point rankings vs Elo ratings, joining points to events, series, and on-demand historical snapshots
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:40Z
scope:
  - src/domain/index-builder.ts
  - src/routes/rankings.ts
  - src/routes/ratings.ts
  - src/routes/snapshots.ts
confirmed_commit: 6d5c1ad18e50399efa9d51af7406f82243c41406
---

Rankings and ratings are different data and are kept in separate maps on the `Index`: `rankings` and `ratings`, keyed by series name (`ranking-open`, `rating-women`, ...). `buildPointsSeries(points, results)` in `src/domain/index-builder.ts` builds both; the series prefix decides which via `parseSeriesKey` ([Division normalization](/features/division-normalization.md)).

## Rankings
Cumulative tournament points. Entries without `id` are dropped; sorted by upstream `rank`. Each entry has a `breakdown` built from `pointsList`: every `resultsId` is looked up in the built results map to attach `eventId`, `eventName` and `division` (null when the result is unknown or withheld), sorted by points descending. This join is the service's main value. See [Points and rounds](/pitfalls/points-and-rounds.md) for how team points differ.

## Ratings
Elo-style strength estimate, no breakdown. Entries lacking `id` or a numeric `rating` are skipped with a warning; the rest are sorted by rating descending and `rank` is positional (upstream gives none). Carries `matchCount` and peak rating/rank with padded ISO dates. A rating with few matches is weak; `/ratings` accepts `minMatchCount`.

## Routes
`src/routes/rankings.ts` and `src/routes/ratings.ts` expose `/series` and `/` (query `series` or `division`, defaulting to `ranking-open` / `rating-open`; unknown series -> 404 listing available keys; paginated). See [Routes and schemas](/conventions/routes-and-schemas.md).

## Snapshots
`Index.snapshots` lists manifest entries (hidden ones dropped). `GET /snapshots/{key}` in `src/routes/snapshots.ts` fetches the snapshot from upstream on demand (about 100 exist, rarely read), reshapes it with `snapshotToPoints` (a bare array keyed by the series part of the snapshot key), and runs the same `buildPointsSeries` against the current `index.results`, so shapes match the live feed. Upstream failure -> 503. Breakdown event fields may be null for old snapshots whose results are gone. See [Upstream](/components/upstream.md).

## Gaps
- `playerId` is the canonical id: `buildPointsSeries(points, results, canonicalPlayerId)` resolves alias GUIDs, and warns when a series lists one player twice under different aliases.
- Snapshot `division` is the series token from the key (`open`), like live series; the manifest's `divisionName` (`Open Pairs`) is ignored, so `GET /snapshots?division=open` matches.
