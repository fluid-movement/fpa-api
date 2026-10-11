Three fixes ([Division normalization](/features/division-normalization.md), [Rankings, ratings and snapshots](/features/rankings-and-ratings.md), [Degrade and flag](/conventions/degrade-and-flag.md)):

- `src/domain/divisions.ts`: add `open test` to `UNKNOWN_MARKERS`, as the header comment already says it is noise.
- `buildSnapshots` in `src/domain/index-builder.ts`: `division` comes from `parseSeriesKey` on the key instead of the manifest's `divisionName`.
- `buildIndex`: when `normalizeResult` returns null for a record that is not hidden, collect its id and emit one warning listing the dropped results.
