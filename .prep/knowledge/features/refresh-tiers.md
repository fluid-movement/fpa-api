---
type: feature
title: Tiered refresh
description: Directory and manifest probes escalating to full refreshes, the hourly floor, and token-protected `POST /refresh`
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:00Z
scope:
  - src/store/scheduler.ts
  - src/routes/admin.ts
  - src/config.ts
confirmed_commit: 4cd5d6c5955a67bafd7dbc4da2caab895406115c
---

Upstream has no ETag or Last-Modified, so freshness comes from cheap probes that escalate to a full corpus refresh. Table and rationale: `docs/ARCHITECTURE.md`, section "Refresh strategy". The work is done by [Store](/components/store.md); timers live in `startScheduler(store)` (`src/store/scheduler.ts`).

## Tiers
| Tier | Default | Env var | Calls |
| --- | --- | --- | --- |
| Directory probe | 60 s | `DIRECTORY_PROBE_INTERVAL_MS` | `store.probeDirectory()` |
| Manifest probe | 10 min | `MANIFEST_PROBE_INTERVAL_MS` | `store.probeManifest()` |
| Full refresh | 60 min | `FULL_REFRESH_INTERVAL_MS` | `store.refresh()` |
| `POST /refresh` | on demand | `REFRESH_TOKEN` | `store.refresh()` |

Intervals are parsed by `intEnv` in `src/config.ts` and must be positive integers, otherwise startup throws. Timers are `unref()`ed and task errors are logged, never thrown. `startScheduler` returns a stop function.

## Escalation
- The directory probe fetches `getEventDirectory` plus a 42-byte version probe per directoried event. Locking a pool changes the event version but not the directory JSON, so versions are part of the signature. A changed signature triggers `refresh()`.
- The manifest probe compares the `getManifest` payload; a change triggers `refresh()`.
- Probe failures are recorded against the source and return `false` (no escalation). A failed per-event version probe reuses the cached version so a blip does not look like a change.
- The hourly full refresh covers changes no probe sees (for example a renamed player).
- All paths go through `refresh()`, which shares one in-flight promise.

## POST /refresh
Defined in `src/routes/admin.ts`. With `REFRESH_TOKEN` unset the route returns 503 (disabled, fails closed). Otherwise it requires `Authorization: Bearer <token>`, compared in constant time by `tokensMatch` (`src/lib/auth.ts`; 401 on mismatch), runs `store.refresh()` and returns `{ refreshed: true, status }`. If `refresh()` returns `false` (including the carried-over case) it answers 503 and points to `GET /health`. `GET /healthz` is a liveness-only check independent of upstream.
