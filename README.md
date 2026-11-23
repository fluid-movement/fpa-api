# fpa-api

A read-only REST API over the freestyle frisbee judging, results and rankings data.

The community's competitive data lives in [FullstackFreestyleTools](https://github.com/SmilesAir/FullstackFreestyleTools)
(freestylejudge.com). This service keeps a mirror of its finished events, players and rankings —
synced incrementally by content hash through a sync API ([`docs/SYNC_API.md`](docs/SYNC_API.md)) —
resolves duplicate player identities, normalizes inconsistent division names, joins ranking points
back to the events that produced them, and serves the result from an in-memory index in
microseconds.

Built with [Hono](https://hono.dev) and [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi).

---

## Quick start

```bash
pnpm install
pnpm dev
```

Then open **http://localhost:3000/docs** for the interactive API reference.

On first boot the service runs a full sync from upstream (about 20 requests) and is ready
immediately after; later boots serve the saved snapshot at once and sync only what changed.
Requests arriving before the first data get `503` with a `Retry-After` header. Point
`UPSTREAM_BASE_URL` at a local FullstackFreestyleTools to develop against it.

```bash
curl localhost:3000/health                        # freshness + data quality
curl 'localhost:3000/rankings?limit=10'           # current open rankings
curl 'localhost:3000/ratings?minMatchCount=50'    # Elo ratings, meaningful ones only
curl 'localhost:3000/players?q=santolin'          # find a player
curl localhost:3000/players/<playerId>            # career profile
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Watch-mode dev server on port 3000 |
| `pnpm build` | Compile to `dist/` |
| `pnpm start` | Run the compiled build |
| `pnpm check` | Typecheck (no emit) |
| `pnpm test` | Run the test suite |
| `pnpm spec` | Regenerate `openapi.json` |

## Deploying

Build pack must be **Dockerfile**, not Nixpacks — Nixpacks pins pnpm 9 against this repo's pnpm 11
lockfile and fails. Mount a volume at `/app/data`, health check `/healthz`, port `3000`. Full
details in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Documentation

| Document | Read it when |
| --- | --- |
| [`docs/UPSTREAM.md`](docs/UPSTREAM.md) | You need to know where the data comes from and what is wrong with it |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | You are changing how the service fetches, caches or normalizes |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | You are deploying it, or something is broken |
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | You are consuming this API from fpa-events |
| `/docs` (running service) | You want the full endpoint reference |
| `openapi.json` | You want to generate a client |

---

## What it does that upstream cannot

**Joins ranking points to events.** Upstream stores a ranking entry as a list of `resultsId`
references with point values. This service resolves them, so `"Francesco Santolin — 1632 points"`
becomes a breakdown naming FPAW2024, Copa Città di Milano and the rest.

**Merges duplicate players.** About 500 of 3100 upstream player records are duplicates linked by an
`aliasId` chain. Requesting any alias GUID here returns the canonical player, with all their
results merged.

**Normalizes divisions.** Production contains `Open Pairs` alongside `Open Coop`, `open pairs`,
`Open pairs`, `undefined` and `Results`. Rankings group by division, so unmerged variants silently
split a division's history.

**Separates rankings from ratings.** These share an envelope upstream but are entirely different
measurements — accumulated tournament points versus an Elo-style strength estimate — with different
schemas. They are separate endpoints here.

**Fails loudly, not silently.** Records referencing a missing player or event are kept and flagged
rather than dropped. `GET /health` lists every data-quality problem found in the current corpus.

## Endpoints

| Endpoint | Returns |
| --- | --- |
| `GET /events` | Event list, with name/date/division filters |
| `GET /events/{id}` | One event plus all its results |
| `GET /events/{id}/results` | Just the results |
| `GET /players` | Canonical player directory (players hidden upstream are left out) |
| `GET /players/{id}` | Profile (bio, nickname, links… from fpa-profiles), career stats, standings, every placement |
| `GET /rankings` | Season standings by tournament points |
| `GET /rankings/series` | Available ranking series |
| `GET /ratings` | Elo-style strength ratings |
| `GET /ratings/series` | Available rating series |
| `GET /snapshots` | Historical ranking/rating snapshots |
| `GET /snapshots/{key}` | One historical snapshot |
| `GET /match/events` | Rank upstream events against one of ours, for linking |
| `GET /match/players` | Same, for players |
| `GET /health` | Freshness, per-source status, data-quality warnings |
| `POST /refresh` | Force an immediate sync (token-protected) |

## Two traps worth knowing before you build a UI

**`points` on a team is not comparable across events.** Its meaning depends on the ruleset the
event used: under FPA2020 a higher number is better, under SimpleRanking it is a sum of judge ranks
so a *lower* number is better. The ruleset is not exposed in the results data. **Sort and display
by `place`, never by `points`.**

**Round 1 is the final.** Rounds count backwards: `round1` = Finals, `round2` = Semifinals,
`round3` = Quarterfinals. Round numbers are also not contiguous — an event may have rounds 1, 3 and
5 with nothing in between.

## Configuration

Everything has a working default; see [`.env.example`](.env.example) for the full list. The ones
that matter:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `REFRESH_TOKEN` | *(unset)* | Bearer token for `POST /refresh`. **Unset disables the route.** |
| `CORS_ORIGINS` | *(unset)* | Comma-separated allowlist. Unset means server-to-server only. |
| `UPSTREAM_BASE_URL` | `https://freestylejudge.com` | FullstackFreestyleTools: the sync API and the Points API |
| `SYNC_INTERVAL_MS` | `3600000` | How often to sync. A quiet sync is two small requests. |
| `REQUEST_TIMEOUT_MS` | `30000` | Per-request upstream timeout |
| `SNAPSHOT_PATH` | `./data/snapshot.json` | Last-good sync state, for surviving restarts and syncing incrementally after one |
| `PROFILES_URL` | *(unset)* | Base URL of [fpa-profiles](https://github.com/fluid-movement/fpa-profiles), whose `/export` supplies player profiles. Unset disables profiles. |

## Data protection

Player names and countries are personal data. The upstream sends no gender, membership number or
other personal fields, and this API serves none. Players hidden upstream are left out of the player
list, search and matching; results still name them, so line-ups stay whole.
