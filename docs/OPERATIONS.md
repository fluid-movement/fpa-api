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
  full sync (~20 upstream calls) — and a restart during an upstream outage serves 503s until
  upstream recovers. With the volume, a restart serves at once and syncs only what changed, and a
  cold start during a total outage still serves the full dataset.
- **Outbound HTTPS to `UPSTREAM_BASE_URL`** (`freestylejudge.com` by default).

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

To serve player profiles, set `PROFILES_URL` to fpa-profiles' base URL (its `/export` is pulled with
every sync), and give fpa-profiles this service's `REFRESH_TOKEN` as its
`FPA_API_REFRESH_TOKEN` so a saved profile is public immediately. Unset, profiles are disabled.

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
  "lastFullRefreshAt": 1784986071820,   // last successful read of the sync API
  "lastRefreshDurationMs": 420,
  "refreshing": false,
  "origin": "network",                  // or "snapshot" — see below
  "sources": {
    "syncManifest":   { "lastSuccessAt": 1784986071820, "lastErrorAt": null, "lastError": null },
    "events":         { … },            // only called when something changed
    "players":        { … },            // only called when the players hash changed
    "pointsManifest": { … },
    "points":         { … },            // only called when a series' latest key changed
    "profiles":       { … }
  },
  "sync": {
    "formatVersion": 1,
    "generatedAt": "2026-11-23T10:00:00.000Z",
    "events": 912,
    "playersHash": "9e107d9d372bb6826bd81d3542a419d6",
    "pointsKeys": { "ranking-open": "ranking-open_2026-11-5", "rating-open": "rating-open_2026-11-5" },
    "lastChanges": { "at": 1784986071820, "requests": 2, "eventsFetched": 0, "eventsRemoved": 0,
                     "eventsMissing": 0, "playersFetched": false, "pointsFetched": [], "pointsRemoved": [] }
  },
  "counts": { "players": 2631, "hiddenPlayers": 4, "events": 912, "results": 1484, "rankingSeries": 2, "snapshots": 85 },
  "warnings": [ "…" ]
}
```

Because `events`, `players` and `points` are only called when the manifests say something changed,
an old `lastSuccessAt` on them is normal. Freshness is `lastFullRefreshAt` and `syncManifest`.

Worth alerting on:

| Signal | Meaning |
| --- | --- |
| `ready: false` for more than a minute | No data at all — upstream down and no snapshot |
| `origin: "snapshot"` persisting | Serving carried-over data; every sync has failed |
| `lastFullRefreshAt` older than ~2 hours, or `null` while `ready` | The scheduler is stuck or upstream is failing |
| A source with a recent `lastErrorAt` | That upstream endpoint is unhealthy (`lastError` carries upstream's `error` text) |
| `syncManifest.lastError` mentions `formatVersion` | Upstream made a breaking change to the sync API; fpa-api needs an update |
| `counts.results` dropping sharply | Upstream data loss, or a normalization regression |

`warnings` grows as upstream data quality drifts. It is informational, not an error condition — but
a sudden jump usually means something changed upstream and is worth reading.

---

## Common situations

### Results were just entered upstream and are not showing

Expected: the sync runs hourly, and the sync API only lists an event once it has finished — ended
before today, not playing, every team placed (see [UPSTREAM.md](UPSTREAM.md)). An event appears the
day after it ends at the earliest. To sync immediately:

```bash
curl -X POST https://your-host/refresh -H "Authorization: Bearer $REFRESH_TOKEN"
```

If `REFRESH_TOKEN` is unset the route returns `503` by design — it fails closed rather than sitting
open.

### Everything returns 503

Check `GET /health`. If `ready` is false, either this is a cold start (wait for the first sync) or
upstream is unreachable and there is no snapshot. Check `sources` for which endpoint is failing,
then confirm directly:

```bash
curl -s https://freestylejudge.com/api/v1/sync/manifest | head -c 300
```

### Upstream returned 404 or 429

`404` on `/api/v1/sync/*` means the sync API is not deployed at `UPSTREAM_BASE_URL` (wrong base URL,
or a FullstackFreestyleTools deploy without our PR). `429` means we hit its `sync` rate limit:
something is calling `POST /refresh` in a loop, or `SYNC_INTERVAL_MS` was set far too low.

### A player's results look incomplete

Almost always an unresolved duplicate upstream: the same person exists under two GUIDs with no
`aliasId` linking them. We can only merge what upstream links. Confirm with:

```bash
curl 'https://your-host/match/players?name=Their%20Name'
```

Two separate canonical entries for one person is the signature. The fix is upstream, via the
maintainer's player-merge tool.

### A player is missing from `/players` or `/match/players`

They may be hidden upstream. Hidden players are left out of lists, search and matching on purpose,
but are still named in results and placements, and `GET /players/{id}` still answers.
`counts.hiddenPlayers` on `/health` shows how many there are.

### Memory keeps growing

The index is roughly 30-60 MB resident. If it grows unboundedly, suspect the snapshot file rather
than the index — check that `SNAPSHOT_PATH` is being overwritten, not appended to (it is written
via write-then-rename, so a growing `.tmp` file means failed renames).

### A sync takes much longer than usual

A quiet sync is two small requests. A slow one is usually a first start (~20 requests, events in
batches of 50 one at a time) or a slow upstream; `sync.lastChanges.requests` on `/health` says how
much work the last sync did.

---

## Changing the API

1. Edit the route definition and its Zod schemas.
2. `pnpm check` and `pnpm test`.
3. `pnpm spec` — **commit the regenerated `openapi.json`.** It is the artifact consumers build
   against, and a stale one is worse than none.

Breaking changes to response shapes need coordinating with fpa-events; see
[INTEGRATION.md](INTEGRATION.md).

## Cost and etiquette

We are a guest on someone else's infrastructure. A quiet sync is cheap — two small, CDN-cached
manifest calls — but it is still counted under upstream's `sync` rate limit, and the data changes a
few times a month. Keep `SYNC_INTERVAL_MS` at an hour and use `POST /refresh` for immediacy instead
of a tighter poll.
