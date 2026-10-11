---
type: component
title: Results parsing
description: Parsing upstream results into rounds, pools and teams, including malformed and hidden records
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:40Z
scope:
  - src/domain/results.ts
confirmed_commit: a59faeb505252c7b1587a39ad9bf09b060c70a34
---

`normalizeResult(id, raw, players, canonicalPlayerId)` in `src/domain/results.ts` turns one upstream result record (one division at one event) into a `DivisionResult`, or `null` when it should not be published.

## Upstream shape
`resultsData` is an object with dynamic keys: `round1`, `round3`, ... each holding `poolA`/`poolB`... each holding `teamData: [{ players: [guid], place, points }]`, plus `divisionName`, `eventId`, `isHidden`. Quirks the parser tolerates:
- Round numbers are non-contiguous (matched by `/^round(\d+)$/i`).
- Pool keys vary in case (`poola`); any key starting `pool` with an object value is a pool. Name = `poolId` uppercased, falling back to `key.slice(4)`.
- `teamData` that is not an array yields an empty pool.
- Non-numeric `place` / `points` become `null`.

## Returns null (record dropped silently, no warning)
- missing `resultsData`, or `isHidden === true`;
- no event id (`raw.eventId ?? data.eventId`);
- no parsable rounds.

## Output
- Rounds sorted ascending. Round 1 is the final: `roundName` gives Finals, Semifinals, Quarterfinals, then `Round N`. Pools sorted by name.
- Teams sorted by `place` (nulls last), since upstream order is arbitrary.
- Team members resolved via `lookupPlayer` ([Player alias resolution](/features/player-identity.md)): alias GUIDs become canonical ids, missing players become `Unknown Player` with `unknown: true`.
- `division` via [Division normalization](/features/division-normalization.md); `divisionRaw` preserved. Event name falls back to `Unknown Event`.

The [Index builder](/components/index-builder.md) calls this for every result not belonging to an in-progress event ([In-progress event gating](/features/in-progress-event-gating.md)). Mind how `place` and `points` relate across rounds: [Points and rounds](/pitfalls/points-and-rounds.md).
