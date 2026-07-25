# fpa-api

A read-only REST API over the freestyle frisbee judging, results and rankings data.

The community's competitive data lives in five independent AWS microservices, each with its own
DynamoDB table and no shared query layer. That makes simple questions expensive: "show me this
player's competitive history" currently means downloading roughly 5 MB across three services and
joining them by hand in the browser.

This service does that work once. It fetches everything, resolves duplicate player identities,
normalizes inconsistent division names, joins ranking points back to the events that produced them,
and serves the result from an in-memory index in microseconds.

Built with [Hono](https://hono.dev) and [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi).

---

## Quick start

```bash
pnpm install
pnpm dev
```

Then open **http://localhost:3000/docs** for the interactive API reference.

The service fetches ~5 MB from upstream on boot (about 4 seconds) and is ready immediately after.
Requests arriving before then get `503` with a `Retry-After` header.

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

**Merges duplicate players.** 508 of 3138 upstream player records are duplicates linked by an
`aliasKey` chain. Requesting any alias GUID here returns the canonical player, with all their
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
| `GET /players` | Canonical player directory |
| `GET /players/{id}` | Profile, career stats, standings, every placement |
| `GET /rankings` | Season standings by tournament points |
| `GET /rankings/series` | Available ranking series |
| `GET /ratings` | Elo-style strength ratings |
| `GET /ratings/series` | Available rating series |
| `GET /snapshots` | Historical ranking/rating snapshots |
| `GET /snapshots/{key}` | One historical snapshot |
| `GET /match/events` | Rank upstream events against one of ours, for linking |
| `GET /match/players` | Same, for players |
| `GET /health` | Freshness, per-source status, data-quality warnings |
| `POST /refresh` | Force an immediate refresh (token-protected) |

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
| `EXPOSE_PERSONAL_FIELDS` | `false` | Include player gender and FPA membership number |
| `FULL_REFRESH_INTERVAL_MS` | `3600000` | Full corpus refresh floor |
| `SNAPSHOT_PATH` | `./data/snapshot.json` | Last-good corpus, for surviving restarts |

The five upstream base URLs are also env vars (`UPSTREAM_PLAYERS`, `UPSTREAM_EVENTS`,
`UPSTREAM_RESULTS`, `UPSTREAM_POINTS`, `UPSTREAM_JUDGING`). They are third-party AWS API Gateway
IDs — if those services are redeployed the IDs change, and being able to repoint without a code
change is the difference between a config edit and an outage.

## Data protection

Player names, countries, genders and FPA membership numbers are personal data. Gender and
membership number are **withheld by default** and only included when `EXPOSE_PERSONAL_FIELDS=true`.
Confirm with the upstream maintainer what is intended to be public before enabling it.
