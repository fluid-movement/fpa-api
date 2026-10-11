---
title: Close small normalization gaps found in the bootstrap survey
kind: code
priority: low
---

Three small inconsistencies with the "degrade and flag" and division-normalization rules:

- `src/domain/divisions.ts`: the header comment lists `Open Test` as noise, but only the exact value `test` maps to `Unknown`, so `Open Test` passes through as a division. Either fix the mapping or the comment.
- `src/domain/index-builder.ts` ~line 98: a snapshot's `division` is the manifest `divisionName` verbatim (or the short series token), not passed through `normalizeDivision`.
- `src/domain/results.ts` `normalizeResult`: results with no event id or no usable rounds are dropped without a warning on `/health`. Hidden results are dropped intentionally.

## Open questions
