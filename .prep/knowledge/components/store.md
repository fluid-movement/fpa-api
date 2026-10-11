---
type: component
title: Store
description: 'The current Index: atomic swap, per-source failure carry-over, shared in-flight refresh, cold-start `IndexNotReady`'
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:00Z
scope:
  - src/store/store.ts
confirmed_commit: a59faeb505252c7b1587a39ad9bf09b060c70a34
---

`Store` (`src/store/store.ts`, singleton `store`) holds the current read model (`Index`) and owns all refresh logic. Routes read from it; the scheduler and `POST /refresh` drive it. Related: [Snapshot persistence](/components/snapshot-persistence.md), [In-memory read model](/decisions/in-memory-read-model.md); `docs/ARCHITECTURE.md`, section "Two invariants in the store".

## Invariants
- **Atomic swap.** `#index` and `#corpus` are replaced together only after `buildIndex(corpus)` succeeds. If the build throws, the previous index is kept and `refresh()` returns `false`.
- **Failure never destroys data.** `#doRefresh` fetches players, events, results, manifest, points and directory in parallel via `sources.*` (`src/upstream/sources.ts`), each tolerant of failure. A failed source takes the same field from the previous corpus. If a core source (players, events, results) has neither a fresh nor a carried value, the refresh returns `false` and nothing changes.
- **Honest freshness.** `coreFetched` is true only when all three core sources were fetched this time. Only then do `fetchedAt`, `lastFullRefreshAt` and `origin = 'network'` advance and the snapshot get rewritten. A carried-over build sets `origin = 'snapshot'`, leaves `lastFullRefreshAt` alone, skips the snapshot write and returns `false`, so a full outage does not look healthy.

## Shared in-flight refresh
`refresh()` returns the existing `#refreshing` promise if one is running, so concurrent callers (scheduler, probes, `POST /refresh`) share one upstream pull.

## Cold start
`initialize()` loads the snapshot (if any), builds the index from it (`origin = 'snapshot'`), then calls `refresh()`. With no snapshot and a failed refresh the index stays `null`: `requireIndex()` throws an error named `IndexNotReady` and `status.ready` is false (`GET /health` returns 503). `hydrate(corpus)` builds from an in-memory corpus for tests and fixtures.

## Per-source status
`#record(source, error)` maintains `lastSuccessAt/lastErrorAt/lastError` for seven `SourceName`s (the six fetched above plus `judging`). The `status` getter exposes these with counts, `warnings`, `origin` and `refreshing`; `GET /health` serialises it.

## Live locks
After the parallel fetch, `#fetchLiveLocks` reads per-pool lock state for each event in the directory: a version probe first, the ~247 KB `getEventData` only when the version moved, and the previous `EventLockState` carried on failure. This feeds the in-progress event gating in `buildIndex`.

## Probe signatures
`probeDirectory` / `probeManifest` compare a JSON signature with the last one and call `refresh()` on change. The directory signature folds in per-event data versions (sorted keys); `#signDirectory` must compute identically after a refresh and in a probe, or every probe reports a spurious change.
