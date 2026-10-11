---
type: overview
title: fpa-api
description: Read-only REST API that joins the freestyle frisbee community's five upstream services into one in-memory read model
status: draft
generated:
  by: claude-code/opus-5.5
  at: 2026-10-11T08:16:58Z
---

fpa-api is a read-only REST API (TypeScript, Hono with `@hono/zod-openapi`, Node 22, pnpm 11) over the freestyle frisbee community's judging, results and rankings data. Upstream is five independent AWS microservices (players, events, results, points, judging) with no shared query layer, no referential integrity and no cache headers. The whole corpus is about 5 MB, so the service fetches everything, builds an immutable in-memory `Index` and serves every request from RAM. Its value is the normalization: duplicate players merged through alias chains, dirty division names canonicalized, ranking points joined back to the events that produced them, and broken references flagged instead of dropped.

The code is layered. `src/upstream/` fetches raw payloads without interpreting them; `src/domain/` turns them into the `Index` with pure, synchronous functions; `src/store/` holds the current Index, swaps it atomically, runs tiered refreshes and persists the last good raw corpus to disk; `src/routes/` are thin `createRoute()` handlers whose Zod schemas in `src/schemas/` double as the OpenAPI spec committed in `openapi.json`.

`pnpm dev` runs the server on port 3000 (reference at `/docs`), `pnpm test` runs the vitest suite against fixtures with no network, `pnpm check` typechecks, `pnpm spec` regenerates `openapi.json`. Production is a Docker image on Coolify. The human-facing documentation lives in `docs/` (ARCHITECTURE, UPSTREAM, OPERATIONS, INTEGRATION) and the README.
