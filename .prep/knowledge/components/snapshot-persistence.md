---
type: component
title: Snapshot persistence
description: Last-good raw corpus written atomically to `SNAPSHOT_PATH` and served on boot before the first network refresh
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:18:47Z
scope:
  - src/store/snapshot.ts
  - src/store/snapshot.test.ts
confirmed_commit: 6d5c1ad18e50399efa9d51af7406f82243c41406
---

`src/store/snapshot.ts` persists the last good raw `Corpus` so a restart during an upstream outage still serves data. Overview of the rationale: `docs/ARCHITECTURE.md`, section "Surviving restarts".

## Behaviour
- `saveSnapshot(corpus)` writes `{ version: 1, corpus }` as JSON to `config.snapshotPath` (env `SNAPSHOT_PATH`, default `./data/snapshot.json`; the Dockerfile sets `/app/data/snapshot.json`). It creates the directory, writes `<path>.tmp`, then `rename`s over the target, so a crash mid-write cannot leave a truncated file.
- `loadSnapshot()` returns the corpus, or `null` when it cannot be used. A missing file (ENOENT, the first-boot state) is silent; an unreadable file, invalid JSON, `version !== SNAPSHOT_VERSION`, or a corpus missing one of the object-valued sources `buildIndex` reads (`players`, `events`, `results`, `manifest`, `points`) logs a `[snapshot]` warning. Deeper shape is not validated. Bumping `SNAPSHOT_VERSION` is the way to discard incompatible snapshots after a `Corpus` shape change.

## When it is used
- `Store.initialize()` loads the snapshot, builds the index from it and sets `origin = 'snapshot'`, then immediately starts a network refresh. The service therefore answers requests before the first upstream call completes.
- `Store.#doRefresh` calls `saveSnapshot` only when all three core sources (players, events, results) were freshly fetched. A refresh that only carried data forward does not rewrite the file, so the snapshot keeps an honest `fetchedAt`. A write failure is logged as a warning and does not fail the refresh.

## Raw, not derived
The snapshot holds raw upstream payloads plus `directory` and `liveLocks`, never the built `Index`. Normalization changes between deploys, and the index is rebuilt from the snapshot on every boot. See decision [In-memory read model](/decisions/in-memory-read-model.md).

## Operations
Production needs a persistent volume at the snapshot directory, otherwise a cold start during an outage serves 503 (`docs/OPERATIONS.md`, deployment section). The file is a few MB of JSON.
