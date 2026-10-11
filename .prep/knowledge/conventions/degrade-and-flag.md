---
type: convention
title: Degrade and flag, never drop
description: How broken upstream references are kept, flagged and surfaced on /health instead of dropped
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:18:38Z
scope:
  - src/domain/**
  - src/routes/admin.ts
confirmed_commit: 3eba31febdf395f278c52a1f33985da446986864
---

Upstream has no referential integrity, so the domain layer never discards a record because a reference is broken. It substitutes a usable value, keeps the data, and appends a human-readable string to `Index.warnings`. `GET /health` (`src/routes/admin.ts`, `StatusSchema.warnings`, from `store.status`) returns them as "non-fatal data problems found while normalizing". When adding normalization code, follow this pattern: never throw on bad data, never silently filter.

## Where it is applied

- Unknown players: `lookupPlayer` (`src/domain/players.ts`) returns `{ fullName: 'Unknown Player', unknown: true }` for ids missing from the directory. `buildIndex` counts distinct unknown ids and emits one aggregate warning. See [Player identity](/features/player-identity.md).
- Alias problems: in `players.ts` an alias loop picks the lexicographically smallest id in the cycle as canonical; an alias to a missing player keeps the current id. Both return a warning.
- Results whose event is missing from the summary service: `buildIndex` synthesizes a stub `EventSummary` (null dates) and warns, rather than dropping the results.
- Rating entries with no id/rating are skipped with a counted warning in `buildPointsSeries`; ranking `pointsList` entries whose `resultsId` is not in the results get `eventId/eventName/division: null` instead of being removed.
- Missing names fall back to `'Unknown Player'` / `'Unnamed Event'` / `'Unknown Event'`; non-numeric `place`/`points` become `null`.
- Withheld in-progress events also add a warning each: [In-progress gating](/features/in-progress-event-gating.md).

## What is dropped (deliberately)

Only records that cannot be published: `isHidden` results, results with no event id, and results with no parseable rounds (`normalizeResult` returns `null`; `buildIndex` flags every dropped non-hidden record in a warning). Everything else is kept.

## Why

Serving "no results found" because of one dangling GUID would be worse than serving a result with an "Unknown Player" and a visible warning. Operators watch `/health` (see [Deployment](/components/deployment.md)) to prompt fixes upstream.
