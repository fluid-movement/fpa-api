---
type: feature
title: Withholding in-progress events
description: Events are withheld until every judging pool is locked; CONSUME_IN_PROGRESS_EVENTS overrides
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:18:38Z
scope:
  - src/domain/index-builder.ts
  - src/store/store.ts
  - src/upstream/sources.ts
confirmed_commit: 3594ceeff269a1222970df21c9a495bec9633e02
---

An event still being judged has partial, changing results, so it is withheld whole from the `Index`. Full upstream rationale: `docs/UPSTREAM.md`, section "Pool locks are the finished signal".

## The signal

The event record has no "running" flag. The judging service has a per-pool `isLocked` flag (read from `getEventData/{key}` at `eventData.eventData.poolMap`). An event is finished when every pool is locked. Presence in `getEventDirectory` is only a candidate filter: `showInDirectory` is cleared manually and stays true for weeks after an event ends.

## Code

- `summarizePoolLocks(payload)` (`src/domain/index-builder.ts`) returns `EventLockState { allPoolsLocked, poolCount, unlockedCount, observedAt }`. An empty pool map counts as NOT locked.
- `Store.#fetchLiveLocks` (`src/store/store.ts`) runs after the parallel fetch in a refresh, for each directory event key: probes `sources.eventDataVersion` (42 B) and only refetches `sources.eventData` (~247 KB) when the version signature changed. On failure it carries the previous observation forward and records `judging` source health. Result lands in `Corpus.liveLocks`.
- `findInProgress(corpus, warnings)` decides per directory entry: lock observed and all locked -> history; lock observed with unlocked pools -> withheld; no lock observed -> calendar fallback: withhold only if `endDate` is null or not before today (UTC date), so a judging outage cannot drop a finished event.
- `buildIndex` skips results whose `eventId` is withheld and skips the `EventSummary` entirely (unless the override below is set). Each withheld event adds a warning visible on `/health` (see [Degrade and flag](/conventions/degrade-and-flag.md)).
- `Store.probeDirectory` folds per-event version probes into the directory signature, since locking a pool leaves the directory payload byte-identical; see [Refresh tiers](/features/refresh-tiers.md).

## Override

`CONSUME_IN_PROGRESS_EVENTS=true` (`config.consumeInProgressEvents`, strict `=== 'true'`) publishes in-progress events instead of withholding them (and drops the "withheld" warnings). `findInProgress` still classifies them, so `Index.live` is unaffected. See [Configuration](/components/configuration.md).

## Live event
`Index.live` is the first directory entry that `findInProgress` classifies as in progress, or null. A finished event that lingers in the directory is never live. Nothing serves `live` yet; it is groundwork for live scores.

## Limits

Upstream ranking totals (`points`, `rank`) still include a running event. We can decline to attribute points to the withheld event (breakdown entries then have null event fields) but cannot recompute totals.
