---
type: pitfall
title: Team points and round numbering
description: Team points are not comparable across rulesets (sort by place) and round 1 is the final, rounds non-contiguous
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:18:38Z
scope:
  - src/domain/results.ts
  - src/schemas/domain.ts
confirmed_commit: a59faeb505252c7b1587a39ad9bf09b060c70a34
---

Two traps in result data. Background: `docs/UPSTREAM.md`, section "The `points` trap".

## Team `points` has no stable meaning

`teamData[].points` depends on the ruleset the event was judged under: under FPA2020 it is a score (higher is better); under SimpleRanking it is a sum of judge ranks (lower is better). The `rulesId` lives in the judging blob, which is discarded when an event ends, so the results data cannot tell you which ruleset applied. Points are therefore not comparable across events or even divisions.

- Always sort and display by `place` (1 is best). `normalizePool` in `src/domain/results.ts` sorts teams by `place` ascending, with null places last.
- `normalizeTeam` passes `points` through as `number | null` untouched (non-numbers become `null`).
- The `Team.points` description in `src/schemas/domain.ts` warns API consumers explicitly; keep it when changing the schema.
- Do not confuse this with ranking `points` (`RankingEntry.points`, a series total from the points service): those are comparable within a series. See [Rankings and ratings](/features/rankings-and-ratings.md).

## Round numbers

- Round keys are `round<N>` in the raw data and are not contiguous (`round1`, `round3`, `round5` with gaps is common). `normalizeResult` finds them by regex `^round(\d+)$` (case-insensitive), not by counting.
- Round 1 is the final, counting backwards: `roundName` maps 1 to "Finals", 2 to "Semifinals", 3 to "Quarterfinals", anything else to `Round N`. A gap means "Round 3" may be the only earlier round present; do not assume round 2 exists.
- Rounds are sorted ascending by number, so output reads finals first.
- Pool keys are usually `poolA` but lowercase `poola` occurs; matching is case-insensitive on the `pool` prefix and the name falls back to `key.slice(4)` uppercased.

See [Results parsing](/components/results-parsing.md) for the full parse.
