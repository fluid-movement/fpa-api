---
type: convention
title: Layering rules
description: 'Who may import whom: upstream never interprets, domain never does I/O, routes never compute; read before adding code to src/ or moving logic between layers'
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:39Z
scope:
  - src/**
confirmed_commit: a59faeb505252c7b1587a39ad9bf09b060c70a34
---

The code is split into four layers with one-way dependencies. Keeping logic in the right layer is what lets the tests run with no network and the whole read path serve from RAM.

| Layer | Directory | Rule |
| --- | --- | --- |
| Upstream | `src/upstream/` | Fetches raw payloads (`client.ts`, `sources.ts`) and types them (`types.ts`, `Raw*`). Never interprets, merges or filters. See [Upstream](/components/upstream.md). |
| Domain | `src/domain/` | Pure, synchronous functions that turn raw payloads into the `Index` (`index-builder.ts`, `players.ts`, `divisions.ts`, `results.ts`). No I/O. |
| Store | `src/store/` | Holds the current `Index`, swaps it atomically, schedules refreshes and persists the snapshot. The only layer that combines upstream with domain. See [Store](/components/store.md). |
| Routes | `src/routes/`, `src/schemas/` | Thin `createRoute()` handlers: validate, look up in `store.index`, paginate, shape. They never derive new facts. See [Routes and schemas](/conventions/routes-and-schemas.md). |

`src/lib/` holds shared helpers (`http.ts` errors and pagination, `matching.ts` fuzzy scoring) that are pure and layer-neutral.

## Why

- Interpretation lives in one place, so a bug in alias merging or division normalization is fixed once and covered by fixture tests ([Testing](/conventions/testing.md)).
- Domain code importing `Raw*` types from upstream is fine (type-only); upstream importing domain is not.
- Anything a route needs repeatedly is precomputed in the `Index` ([In-memory read model](/decisions/in-memory-read-model.md)).

## Known deviations (the code wins over the rule)

- `src/domain/players.ts` and `src/domain/index-builder.ts` import `config` to read `exposePersonalFields` and `consumeInProgressEvents`. Domain is pure given the config, not config-free. See [Configuration](/components/configuration.md).
- `src/routes/snapshots.ts` calls `sources.pointsSnapshot(key)` (upstream) and then `buildPointsSeries`/`snapshotToPoints` (domain) inside the handler, bypassing the store. It is the one route that does I/O and computation, for an on-demand historical snapshot; keep it the exception.
- `src/routes/admin.ts` reads `config.refreshToken` directly.

Related: [Degrade and flag](/conventions/degrade-and-flag.md), and `docs/ARCHITECTURE.md`.
