---
type: component
title: Index builder
description: How `buildIndex()` joins the raw corpus into the immutable `Index` read model and what the Index holds
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:40Z
scope:
  - src/domain/index-builder.ts
  - src/domain/types.ts
confirmed_commit: a59faeb505252c7b1587a39ad9bf09b060c70a34
---

`buildIndex(corpus)` in `src/domain/index-builder.ts` is a pure, synchronous function: raw `Corpus` in, immutable `Index` out (type in `src/domain/types.ts`). No I/O; the only clock reads are `builtAt` and the calendar fallback in `findInProgress`. The [Store](/components/store.md) calls it on every refresh and swaps the result in atomically. `Corpus` is also what [snapshot persistence](/components/snapshot-persistence.md) writes to disk (raw, so normalization changes never meet stale derived data).

## Build order
1. `buildPlayers` -> `players`, `canonicalPlayerId` ([Player alias resolution](/features/player-identity.md)).
2. `findInProgress` -> set of event ids to withhold ([In-progress event gating](/features/in-progress-event-gating.md)).
3. `normalizeResult` per raw result, skipping in-progress events ([Results parsing](/components/results-parsing.md)); grouped into `resultsByEvent`.
4. `events` from the event summaries (in-progress ones skipped), with `divisions` and `resultCount` derived from results. Results whose event is missing get a synthesized stub event plus a warning, so results are never dropped.
5. Warning for player ids that appear in results but not in the directory.
6. `buildPointsSeries` -> `rankings`, `ratings` ([Rankings and ratings](/features/rankings-and-ratings.md)).
7. `buildPlacements` -> `placementsByPlayer` (per canonical player, newest event date first; each placement lists the other team members as `teammates`).
8. `buildSnapshots` from the manifest (hidden entries dropped, newest `createdAt` first, dates padded to ISO).

## What the Index holds
`builtAt`, `players`, `canonicalPlayerId` (every GUID incl. aliases), `events`, `results`, `resultsByEvent`, `placementsByPlayer`, `rankings`, `ratings`, `snapshots`, `live` and `warnings`. `live` is simply the first `eventDirectory` entry (`eventDirectory?.[0]`), even if that event is being withheld.

## Conventions
- Problems become strings in `warnings` (surfaced on `/health`) instead of exceptions; see [Degrade and flag](/conventions/degrade-and-flag.md).
- `snapshotToPoints` and `summarizePoolLocks` are exported helpers living here too.
- `normalizeDivision` is re-exported from this module.
