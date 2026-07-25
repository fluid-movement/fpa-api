# Operations

Deploying and running the service, and what to do when it misbehaves.

---

## Deploying to Coolify

The service is a plain Node HTTP server with no database and no external state beyond one snapshot
file. It runs alongside fpa-events on the Hetzner VPS.

### Use the Dockerfile build pack, not Nixpacks

Nixpacks **does not work** for this project, and the failure is not obvious from the error message.
Nixpacks installs pnpm from nixpkgs — currently **9.15.9** — while this repo's lockfile is pnpm 11.
Older pnpm sees `pnpm-workspace.yaml` (which carries the `allowBuilds` allowlist esbuild needs),
assumes the repo is a workspace root, and fails with:

```
ERROR packages field missing or empty
```

Even with a `packages:` field added, pnpm 9 cannot install a pnpm 11 lockfile under
`--frozen-lockfile`. The [`Dockerfile`](../Dockerfile) pins the pnpm version via corepack and the
`packageManager` field, so the build is reproducible regardless of what a build pack would pick.

In Coolify: **Configuration → General → Build Pack → `Dockerfile`.**

### Coolify settings

| Setting | Value |
| --- | --- |
| Build Pack | `Dockerfile` |
| Ports Exposes | `3000` |
| Health Check Path | `/healthz` |
| Persistent Storage | Volume mounted at **`/app/data`** |

### Required setup

- **A volume at `/app/data`.** The image defaults `SNAPSHOT_PATH` to `/app/data/snapshot.json`.
  Without persistence the service still runs, but every restart begins with an empty index and a
  ~4 second cold fetch — and a restart during an upstream outage serves 503s until upstream
  recovers. With the volume, a cold start during a total outage still serves the full dataset.
- **Outbound HTTPS to `*.execute-api.us-west-2.amazonaws.com`.**

### Health checks

| Probe | Endpoint | Notes |
| --- | --- | --- |
| Liveness | `GET /healthz` | Plain `ok`. Never touches upstream — use this for container restarts. |
| Readiness | `GET /health` | `503` until the first successful load. |

Do **not** point a liveness probe at `/health`. An upstream outage would then restart the container
in a loop, discarding a perfectly good in-memory index each time — exactly the wrong response. The
Dockerfile's built-in `HEALTHCHECK` already uses `/healthz`.

### Environment

See [`.env.example`](../.env.example). At minimum set `REFRESH_TOKEN` (otherwise `POST /refresh` is
disabled) and `CORS_ORIGINS` if browsers will call this directly. `PORT` and `SNAPSHOT_PATH` are
already set correctly by the image.

### Running it anywhere else

```bash
docker build -t fpa-api .
docker run -p 3000:3000 -v fpa-api-data:/app/data -e REFRESH_TOKEN=… fpa-api
```

---

## Monitoring

`GET /health` is the single place to look:

```jsonc
{
  "ready": true,
  "builtAt": 1784986071820,
  "lastFullRefreshAt": 1784986071820,
  "lastRefreshDurationMs": 3980,
  "refreshing": false,
  "origin": "network",              // or "snapshot" — see below
  "sources": {
    "players":  { "lastSuccessAt": 1784986071820, "lastErrorAt": null, "lastError": null },
    "results":  { … }
  },
  "counts": { "players": 2631, "events": 912, "results": 1484, "rankingSeries": 2, "snapshots": 85 },
  "warnings": [ "…" ]
}
```

Worth alerting on:

| Signal | Meaning |
| --- | --- |
| `ready: false` for more than a minute | No data at all — upstream down and no snapshot |
| `origin: "snapshot"` persisting | Serving carried-over data; every network refresh has failed |
| `lastFullRefreshAt` older than ~2 hours, or `null` while `ready` | The scheduler is stuck or upstream is failing |
| A source with a recent `lastErrorAt` | That specific upstream service is unhealthy |
| `counts.results` dropping sharply | Upstream data loss, or a normalization regression |

`warnings` grows as upstream data quality drifts. It is informational, not an error condition — but
a sudden jump usually means something changed upstream and is worth reading.

---

## Common situations

### Results were just entered upstream and are not showing

Expected: the full refresh runs hourly. To pull immediately:

```bash
curl -X POST https://your-host/refresh -H "Authorization: Bearer $REFRESH_TOKEN"
```

If `REFRESH_TOKEN` is unset the route returns `503` by design — it fails closed rather than sitting
open.

### Everything returns 503

Check `GET /health`. If `ready` is false, either this is a cold start (wait ~5 s) or upstream is
unreachable and there is no snapshot. Check `sources` for which service is failing, then confirm
directly:

```bash
curl -sI https://v869a98rf9.execute-api.us-west-2.amazonaws.com/production/getAllResults
```

### Upstream returned 403/404 on endpoints that used to work

Most likely the upstream services were redeployed under new API Gateway IDs. This is the known
fragility called out in [UPSTREAM.md](UPSTREAM.md) — the base URLs are env vars precisely so this is
a config change, not a code change. Get the new IDs from the maintainer and update
`UPSTREAM_PLAYERS`, `UPSTREAM_EVENTS`, `UPSTREAM_RESULTS`, `UPSTREAM_POINTS`, `UPSTREAM_JUDGING`.

### A player's results look incomplete

Almost always an unresolved duplicate upstream: the same person exists under two GUIDs with no
`aliasKey` linking them. We can only merge what upstream links. Confirm with:

```bash
curl 'https://your-host/match/players?name=Their%20Name'
```

Two separate canonical entries for one person is the signature. The fix is upstream, via the
maintainer's player-merge tool.

### Memory keeps growing

The index is roughly 30-60 MB resident. If it grows unboundedly, suspect the snapshot file rather
than the index — check that `SNAPSHOT_PATH` is being overwritten, not appended to (it is written
via write-then-rename, so a growing `.tmp` file means failed renames).

### Refresh takes much longer than ~4 seconds

The 3.8 MB results payload is uncompressed and its download dominates the refresh. A slow refresh
is almost always upstream Lambda cold-start latency. Persistent slowness is worth raising with the
maintainer — enabling gzip on their side would cut it by roughly 10x.

---

## Changing the API

1. Edit the route definition and its Zod schemas.
2. `pnpm check` and `pnpm test`.
3. `pnpm spec` — **commit the regenerated `openapi.json`.** It is the artifact consumers build
   against, and a stale one is worse than none.

Breaking changes to response shapes need coordinating with fpa-events; see
[INTEGRATION.md](INTEGRATION.md).

## Cost and etiquette

We are a guest on someone else's infrastructure. Before shortening any interval in
`config.refresh`, consider that the full refresh transfers 5 MB uncompressed from a third party's
AWS account. Hourly is ~120 MB/day; at 5-minute intervals it would be ~1.4 GB/day for data that
changes a few times a month. Use `POST /refresh` for immediacy instead of a tighter poll.
