---
type: feature
title: Division normalization
description: Canonical division names from dirty upstream values, and series key parsing
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:40Z
scope:
  - src/domain/divisions.ts
confirmed_commit: 6d5c1ad18e50399efa9d51af7406f82243c41406
---

Upstream division names are free text (`Open Pairs`, `open pairs`, `Open Coop`, `undefined`, `Results`, `Open Test`...). Rankings and event listings group by division, so `src/domain/divisions.ts` canonicalizes them.

## normalizeDivision(raw)
1. `null`/`undefined` -> `Unknown` (`UNKNOWN_DIVISION`).
2. `fold()`: lowercase, `-`/`_` to space, strip other punctuation, collapse whitespace.
3. Folded value in `UNKNOWN_MARKERS` (`''`, `undefined`, `null`, `results`, `test`) -> `Unknown`.
4. `OVERRIDES` table maps known spellings to `CANONICAL_DIVISIONS`: `Open Pairs`, `Women Pairs`, `Mixed Pairs`, `Open Co-op` (bare `open`, `women`, `mixed`, `coop` included).
5. Anything else is title-cased and passed through (e.g. `Open Pairs Challenger`), so unseen real divisions still appear, merely ungrouped.

Markers match the whole folded value: `test` and `open test` (from `Open Test`) become Unknown, but a longer name containing "test" passes through.

The raw string is always preserved as `divisionRaw` on each `DivisionResult` ([Results parsing](/components/results-parsing.md)) so odd results can be traced. Normalization happens in the domain layer, not at fetch time ([Layering](/conventions/layering.md)).

## parseSeriesKey(series)
Splits points series names such as `ranking-open` or `rating-women` into `{ type: 'ranking' | 'rating', division }`. The type is `rating` only when the first part is exactly `rating`, otherwise `ranking`; the division is the remainder (default `open`). That division is the short token, not a canonical name. Used by `buildPointsSeries` and `buildSnapshots` in the [Index builder](/components/index-builder.md); see [Rankings and ratings](/features/rankings-and-ratings.md).
