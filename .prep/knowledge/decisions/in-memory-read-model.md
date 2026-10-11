---
type: decision
title: In-memory read model, no database, no writes
description: Why the corpus lives in RAM, the service is read-only and the snapshot stores raw rather than derived data
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:18:47Z
scope:
  - src/store/**
  - src/domain/index-builder.ts
confirmed_commit: 6d5c1ad18e50399efa9d51af7406f82243c41406
---

## Decision
The whole upstream corpus (~5 MB raw) is held in memory as an immutable `Index` built by `buildIndex()` in `src/domain/index-builder.ts`. The service has no database and never writes to upstream; its only write is the local snapshot file. Data that is ours to edit (player profiles) lives in a separate app with its own database, fpa-profiles, and is pulled read-only like any source ([Player profiles](/features/player-profiles.md)). `docs/ARCHITECTURE.md` ("The shape of the problem", "Deliberate non-goals") gives the long form.

## Why
- The data set is small and changes slowly, so a full in-RAM join (players, events, results, rankings) answers every request without upstream calls. Upstream load is therefore independent of our traffic.
- Upstream offers no ETag or Last-Modified, so cheap probes plus occasional full refreshes (see [Refresh tiers](/features/refresh-tiers.md)) are the only freshness mechanism.
- Rebuilding the index wholesale and swapping one reference makes reads trivially consistent: no locks, no partial state (see [Store](/components/store.md)).
- A database would add operational cost and a second source of truth for data that is already fully re-derivable.

## Consequences
- Memory, not disk, is the capacity limit. The one on-demand upstream fetch is `GET /snapshots/{key}`, which is deliberately not cached.
- Derived state is never persisted. [Snapshot persistence](/components/snapshot-persistence.md) stores the raw `Corpus`; normalization changes take effect on the next boot with no migration.
- Cold start without a snapshot means no data: `requireIndex()` throws `IndexNotReady` and `/health` is 503 until the first successful refresh.
- Because there is a single process holding state, running several replicas means each fetches upstream and holds its own copy; they may briefly disagree.
- Anything that needs new derived data adds it to `buildIndex`, not to a stored schema.
