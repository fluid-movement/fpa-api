---
type: component
title: Build and deployment
description: Dockerfile (pnpm 11 pinned via corepack), Coolify settings, /app/data volume, liveness vs readiness health checks; read before touching the image or deploy setup
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:39Z
scope:
  - Dockerfile
  - .dockerignore
  - package.json
confirmed_commit: 6d5c1ad18e50399efa9d51af7406f82243c41406
---

Production is a Docker image run on Coolify (Hetzner VPS, alongside fpa-events). Full runbook: `docs/OPERATIONS.md`, section "Deploying to Coolify".

## Why a Dockerfile, not Nixpacks

`pnpm-workspace.yaml` carries the pnpm 11 `allowBuilds` allowlist (needed for esbuild). Nixpacks installs pnpm 9.x, treats that file as a workspace root and fails with "packages field missing or empty", and pnpm 9 cannot read a pnpm 11 lockfile anyway. The `Dockerfile` runs `corepack enable`, which honours `packageManager: pnpm@11.17.0` in `package.json` (mirrored in `devEngines`). Set Build Pack to `Dockerfile` in Coolify.

## Image

- Stage `builder` (`node:22-alpine`): copy manifests first (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`) for layer caching, `pnpm install --frozen-lockfile`, copy `tsconfig*.json` and `src`, `pnpm build` (`tsc -p tsconfig.build.json` into `dist/`), then `pnpm prune --prod`.
- Stage `runtime`: `NODE_ENV=production`, `PORT=3000`, `SNAPSHOT_PATH=/app/data/snapshot.json`, installs `wget`, copies `node_modules`, `dist`, `package.json`, creates `/app/data` owned by `node`, runs as `USER node`, `CMD ["node", "dist/index.js"]`.
- `.dockerignore` excludes `node_modules`, `dist`, `data`, `.env*` (except `.env.example`), `docs`, `scripts`, tests and `README.md`. The image builds its own `dist`.
- `engines.node` is `>=22.12`.

## Coolify settings

Ports `3000`; health check path `/healthz`; persistent volume at `/app/data`; set `REFRESH_TOKEN` (and `CORS_ORIGINS` only if browsers call directly). Needs outbound HTTPS to `*.execute-api.us-west-2.amazonaws.com`.

## Volume and health checks

Without the volume the service runs but each restart starts empty (about 4 s cold fetch, 503 during an upstream outage); with it, a cold start serves the last good corpus ([Snapshot persistence](/components/snapshot-persistence.md)).

- Liveness: `GET /healthz` returns plain `ok` and never touches upstream (`src/routes/admin.ts`). The image `HEALTHCHECK` uses it.
- Readiness: `GET /health` is 503 until the first load.
- Never use `/health` for liveness; an upstream outage would restart-loop a healthy container and discard the in-memory index.

Variables: [Configuration](/components/configuration.md). Elsewhere: `docker run -p 3000:3000 -v fpa-api-data:/app/data -e REFRESH_TOKEN=... fpa-api`.
