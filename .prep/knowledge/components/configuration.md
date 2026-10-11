---
type: component
title: Configuration
description: Every environment variable in src/config.ts with its default, fail-closed behaviours, and why upstream URLs are configuration; read before adding or changing a setting
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:39Z
scope:
  - src/config.ts
  - .env.example
confirmed_commit: a59faeb505252c7b1587a39ad9bf09b060c70a34
---

All runtime configuration is read once at import time into the `config` object in `src/config.ts` (`env()` for strings, `intEnv()` for positive integers). `.env.example` lists every variable at its built-in default, so an empty environment works.

## Variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `UPSTREAM_PLAYERS/EVENTS/RESULTS/POINTS/JUDGING` | AWS API Gateway URLs, us-west-2 `/production` | Upstream bases, no trailing slash |
| `REQUEST_TIMEOUT_MS` | 30000 | Per upstream request |
| `FULL_REFRESH_INTERVAL_MS` | 3600000 | Full refetch floor |
| `DIRECTORY_PROBE_INTERVAL_MS` | 60000 | `getEventDirectory` probe |
| `MANIFEST_PROBE_INTERVAL_MS` | 600000 | `getManifest` probe |
| `SNAPSHOT_PATH` | `./data/snapshot.json` (image: `/app/data/snapshot.json`) | Persisted last-good corpus |
| `REFRESH_TOKEN` | unset | Bearer token for `POST /refresh` |
| `EXPOSE_PERSONAL_FIELDS` | false | Only the literal `true` enables gender and membership |
| `CONSUME_IN_PROGRESS_EVENTS` | false | Only the literal `true` consumes unlocked events |
| `CORS_ORIGINS` | empty | Comma-separated allowlist |
| `PROFILES_URL` | unset | fpa-profiles base URL; unset disables [player profiles](/features/player-profiles.md) |

## Behaviours worth knowing

- **Upstream URLs are configuration, not constants.** They are AWS API Gateway IDs owned by a third party; a redeploy changes them and we must repoint without a code change (`docs/OPERATIONS.md`, "Upstream returned 403/404"). See [Upstream](/components/upstream.md).
- **Invalid integers crash at boot**: a non-positive or non-numeric value throws `Invalid <NAME>`. An empty string falls back to the default.
- **Fail closed.** With no `REFRESH_TOKEN`, `POST /refresh` answers 503 (`src/routes/admin.ts`); a wrong token is 401. Personal data and in-progress events are off unless explicitly `true`; see [Personal data](/features/personal-data.md) and [In-progress event gating](/features/in-progress-event-gating.md).
- Intervals drive [Refresh tiers](/features/refresh-tiers.md); the snapshot path is used by [Snapshot persistence](/components/snapshot-persistence.md). Lowering the full interval costs a ~5 MB pull from a third party; prefer `POST /refresh`.
- `config` is a module constant read directly by `domain/`, `upstream/`, `store/` and `routes/admin.ts`, so changing env requires a restart.
