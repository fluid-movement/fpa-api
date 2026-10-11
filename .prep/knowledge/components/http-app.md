---
type: component
title: HTTP app
description: 'App assembly: CORS, the shared error shape, validation hook, 503 with Retry-After, /health vs /healthz, /docs'
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:11Z
scope:
  - src/app.ts
  - src/lib/http.ts
  - src/index.ts
confirmed_commit: 6d5c1ad18e50399efa9d51af7406f82243c41406
---

`createApp()` in `src/app.ts` builds the `OpenAPIHono` instance; `src/index.ts` serves it with `@hono/node-server`. Route modules follow [Routes and schemas](/conventions/routes-and-schemas.md); the data they read is the in-memory [Store](/components/store.md) (`src/store/store.ts`, see [In-memory read model](/decisions/in-memory-read-model.md)).

## Assembly
- Middleware: `logger()` always; `cors()` only when `config.corsOrigins` (env `CORS_ORIGINS`) is non-empty, allowing `GET` and `POST`. Empty means same-origin or server-to-server only.
- Mounts: `/events`, `/players`, `/rankings`, `/ratings`, `/snapshots`, `/match`, and `admin` at `/` (`/health`, `/healthz`, `/refresh`).
- `/openapi.json` is generated live (`app.doc31` with `OPENAPI_DOC`, which also holds the tag list and API description); `/docs` is the Scalar UI; `/` redirects to `/docs`. A `bearerAuth` security scheme is registered, used only by `POST /refresh`.

## One error shape
Every error body is `{ error: string, status: number }` (`ErrorSchema`).
- `defaultHook` turns Zod validation failures into a 400 with `Invalid request — path: message; ...`.
- `httpError()` / `notFound()` in `src/lib/http.ts` throw an `HTTPException` carrying that body; `onError` returns it as is.
- The `notFound` handler returns 404 in the same shape.
- Anything else is logged and returned as a 500 `Internal server error`.
- `commonErrors` (400, 503) and `notFoundResponse` are spread into route `responses` so the spec lists them.

## Cold start: 503 with Retry-After
`index.ts` calls `serve()` before `store.initialize()` finishes (and starts the scheduler). Handlers call `store.requireIndex()`, which throws an error named `IndexNotReady`; `onError` maps it to 503 with `retry-after: 5`. The container keeps accepting connections during a slow first load instead of failing health checks.

## /health vs /healthz
- `GET /health` (`src/routes/admin.ts`): returns `store.status` (per-source status, freshness, warnings); 200 when `ready`, otherwise 503.
- `GET /healthz`: plain `ok` text, always 200, not in the spec; liveness only, independent of data readiness.

## Shutdown
`SIGTERM`/`SIGINT` stop the scheduler, close the server, and force exit after 10 s.

See `docs/OPERATIONS.md` for how health is used in deployment, and [Degrade and flag](/conventions/degrade-and-flag.md) for what the warnings mean.
