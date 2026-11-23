# Architecture

How the service is put together, and why.

---

## The shape of the problem

Upstream is FullstackFreestyleTools: a sync API that lists finished events by content hash, plus a
Points API for rankings ([UPSTREAM.md](UPSTREAM.md)). Its data has no referential integrity worth
trusting — duplicate players, alias chains, dirty division names — but the entire corpus is only
about **5 MB** and grows by a few hundred rows a year.

That single fact drives every decision here: at this size the whole dataset fits comfortably in
memory, so the right design is not a database or a cache tier — it is *mirror everything, derive a
read model once, serve from RAM*.

```
┌─────────────────────────────────────────────────────────────┐
│  upstream/     fetch raw payloads, no interpretation         │
│    client.ts   timeouts, conservative retry                  │
│    sources.ts  one function per endpoint                     │
│    adapter.ts  sync payloads -> Raw* corpus shapes (pure)    │
├─────────────────────────────────────────────────────────────┤
│  domain/       normalization — the reason this service exists │
│    players.ts       alias resolution (loop-safe)             │
│    divisions.ts     name canonicalization                    │
│    results.ts       round/pool/team parsing                  │
│    index-builder.ts joins everything into an Index           │
├─────────────────────────────────────────────────────────────┤
│  store/        the current Index + refresh orchestration      │
│    sync.ts         what to fetch, from hashes (pure)         │
│    store.ts        sync, atomic swap, failure tolerance      │
│    scheduler.ts    one sync interval                         │
│    snapshot.ts     last-good sync state on disk              │
├─────────────────────────────────────────────────────────────┤
│  routes/       thin handlers over the Index                   │
│  schemas/      Zod — validation + types + OpenAPI, one source │
└─────────────────────────────────────────────────────────────┘
```

The layering rule: **`upstream/` never interprets, `domain/` never does I/O, `routes/` never
computes.** `domain/index-builder.ts` is pure and synchronous, which is what makes the entire
normalization surface testable against fixtures with no mocking.

---

## Refresh strategy

There is no `updated_at` upstream, so "changed since" cannot be asked. Instead the sync manifest
carries one hash per finished event and one for the player list, and fpa-api keeps the hashes it
fetched under. Every sync (hourly, `SYNC_INTERVAL_MS`; or `POST /refresh`):

1. Fetch `sync/manifest` and `points/getManifest` (and fpa-profiles' export, when configured).
2. Diff against the stored state (`planSync` in `store/sync.ts`, pure):
   - events that are new or whose hash changed → fetch, in batches of 50, one batch at a time;
   - stored events no longer in the manifest → drop;
   - an event requested but not returned → it stopped being finished in between: drop it;
   - players hash changed → refetch `sync/players`;
   - a series whose latest snapshot key changed → download that snapshot.
3. Build the index from the new state and swap it in.

| Situation | Upstream calls |
| --- | --- |
| Quiet hour | 2 (the manifests) |
| One event corrected | 3 |
| An alias merge | 3 (only the players hash moves; teams carry raw player ids) |
| First start, no snapshot | ~20 |

No request ever triggers an upstream call, so load is independent of our traffic. The one exception
is `GET /snapshots/{key}`, which fetches on demand: there are ~100 snapshots, read rarely.

## Two invariants in the store

**1. The index is swapped atomically.** `buildIndex()` returns a complete new `Index`, which
replaces the old reference in a single assignment. A request sees either the whole old index or the
whole new one — never a half-rebuilt mix. This is why the index is immutable and rebuilt wholesale
rather than mutated in place.

**2. A failed sync never destroys good data, and never half-applies.** The sync API part (manifest,
event batches, players) is all or nothing: if any call fails, nothing it fetched is used, the
previous events and players keep serving, and since their stored hashes did not move the next sync
retries the same work. The points side is independent and per series: a failed points manifest
keeps the previous standings, and a failed snapshot download keeps that series' previous snapshot
(and key, so it is retried). fpa-profiles' export is optional and carries over on failure. With no
prior data and a failed sync, the index stays empty and requests get `503`.

Concurrent `refresh()` calls share one in-flight promise rather than stampeding upstream.

## Surviving restarts

The last good sync state is written to `SNAPSHOT_PATH` after every successful sync, using
write-then-rename so a crash mid-write cannot leave a truncated file. It holds each event's payload
with its hash, the players with theirs, the points manifest, each series' latest snapshot, and the
profiles export.

On boot the service loads that snapshot and serves immediately, *then* syncs in the background —
incrementally, because the snapshot carries the hashes. A restart during an upstream outage
therefore still serves data.

The snapshot stores the **raw** sync payloads, not the derived index. Normalization logic changes
far more often than upstream data does, and a snapshot of derived output would quietly serve
yesterday's bugs after a deploy. The file is versioned (`SNAPSHOT_VERSION`, now 2); a snapshot of
another version is ignored with a warning and replaced by a full sync.

## Error handling philosophy

Upstream has no referential integrity, so broken references are normal rather than exceptional. The
rule is **degrade and flag, never drop**:

- A team member whose GUID is missing from the directory is kept with `unknown: true`.
- Results referencing a non-existent event get a synthesized stub event (cannot happen with the
  sync API, where divisions arrive inside their event, but the index builder still guards it).
- An alias chain that dangles or loops resolves to something usable and emits a warning.

Every warning is surfaced on `GET /health`, so data-quality drift is visible without reading logs.

Requests arriving before the first successful load throw a typed `IndexNotReady` error, which the
app translates to `503` with `Retry-After` — a real cold-start state, not a bug worth a 500.

## OpenAPI

Routes are defined with `createRoute()` from `@hono/zod-openapi`. The Zod schemas in `schemas/` do
three jobs from one definition: runtime request validation, TypeScript inference, and OpenAPI 3.1
generation.

There is no hand-maintained spec to drift — the spec *is* the route definitions. `openapi.json` is
committed so consumers can generate clients without running the service, and so API surface changes
show up as a reviewable diff. Regenerate with `pnpm spec` whenever routes or schemas change.

Validation failures are routed through a `defaultHook` so every `400` uses the same error shape as
the rest of the API.

## Testing

| File | Covers |
| --- | --- |
| `domain/players.test.ts` | Alias chains, loops, dangling references |
| `domain/divisions.test.ts` | Every dirty division value observed in production |
| `domain/results.test.ts` | Round/pool parsing, malformed structures, hidden records |
| `domain/index-builder.test.ts` | Joins, stub events, the rankings/ratings split, hidden players |
| `upstream/adapter.test.ts` | Sync payloads into Raw*, fed through the real normalizers |
| `store/sync.test.ts` | The sync diff: new, changed, removed, players, points keys |
| `store/store.test.ts` | Incremental sync against a fake upstream, batching, last-good on failure |
| `store/snapshot.test.ts` | Snapshot round-trip, old versions and damaged files ignored |
| `lib/matching.test.ts` | Fuzzy scoring, and refusing confidence on same-name-different-year |
| `app.test.ts` | HTTP contract: status codes, error shape, pagination, validation |

`app.test.ts` runs against a hydrated in-memory corpus via `store.hydrate()` — no network.
`store.test.ts` mocks `upstream/sources.ts` with a fake upstream built from the contract. Every
test input mirrors a real upstream quirk; where a test encodes a production oddity, a comment says
so, because otherwise it reads like an invented edge case and gets deleted.

## Deliberate non-goals

**No database.** Adding Postgres would mean managing a schema, migrations and sync for data that
fits in RAM and is not ours to own.

**No writes.** This service is strictly read-only. Upstream is the source of truth, and a write
path would need auth, conflict handling, and a trust relationship we do not have.

**No live or in-progress data.** The sync API lists finished events only, so an event appears once
it is over and fully placed, and never while it is being judged. Serving live scores would be a
separate feature with its own source.

**No auto-linking.** `GET /match/*` ranks candidates and never picks one. Binding the wrong results
to an event is worse than showing none, and only a human can tell "German Championship 2026" from
"German Championship 2026 (Juniors)".
