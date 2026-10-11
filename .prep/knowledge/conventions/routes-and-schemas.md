---
type: convention
title: Defining routes and schemas
description: createRoute() with Zod schemas as the single source for validation, types and OpenAPI; pagination; regenerate openapi.json
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:11Z
scope:
  - src/routes/**
  - src/schemas/**
  - scripts/generate-openapi.ts
  - openapi.json
confirmed_commit: a59faeb505252c7b1587a39ad9bf09b060c70a34
---

Every endpoint is declared with `createRoute()` from `@hono/zod-openapi` and registered with `router.openapi(route, handler)`. The Zod schemas in `src/schemas/` are the single definition for runtime validation, TypeScript types (`c.req.valid('query')` is typed) and the OpenAPI 3.1 document. There is no hand-written spec. See `docs/ARCHITECTURE.md`, section "OpenAPI".

## Layout
- `src/routes/*.ts`: one `OpenAPIHono` per area (`events`, `players`, `rankings`, `ratings`, `snapshots`, `match`, `admin`), mounted in `src/app.ts`.
- `src/schemas/domain.ts`: response shapes (`PlayerSchema`, `EventSummarySchema`, `ErrorSchema`, ...), named via `.openapi('Name')` where they become components.
- `src/schemas/params.ts`: reusable request schemas.

## Rules
- Give each route `tags`, `summary`, a `description` that explains pitfalls, and responses for 200 plus `...commonErrors` (400, 503) from `src/lib/http.ts`; add `...notFoundResponse` when a lookup can 404.
- Query values arrive as strings, so numbers are coerced in the schema (`z.coerce`) and booleans are modelled as `z.enum(['true','false'])`, not coerced. Do not parse in handlers.
- Path params need `.openapi({ param: { name, in: 'path' } })`.
- Dates use `DateString` (`YYYY-MM-DD`).
- Handlers read from `store.requireIndex()` and throw `httpError()` / `notFound()`; do not craft error JSON by hand.

## Pagination
`PaginationQuery` gives `limit` (1-500, default 50) and `offset` (default 0); `RankingPaginationQuery` raises the default limit to 100. Handlers slice in memory with `paginate(items, page)` returning `{ items, total, limit, offset }`. Match endpoints are not paginated; they return at most 10 candidates ([Candidate matching](/features/candidate-matching.md)).

## Regenerating `openapi.json`
`pnpm spec` runs `scripts/generate-openapi.ts`, which calls `createApp().getOpenAPI31Document(OPENAPI_DOC)` and writes the committed `openapi.json`. Re-run and commit it whenever routes or schemas change (`docs/OPERATIONS.md` lists this in the release steps). The diff is the reviewable API change; consumers generate clients from it (`docs/INTEGRATION.md`).
