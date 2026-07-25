# Architecture

How the service is put together, and why.

---

## The shape of the problem

Upstream is five independent services with no shared query layer, no referential integrity, and no
cache headers. But the entire corpus is only about **5 MB** and grows by a few hundred rows a year.

That single fact drives every decision here: at this size the whole dataset fits comfortably in
memory, so the right design is not a database or a cache tier — it is *fetch everything, derive a
read model once, serve from RAM*.

```
┌─────────────────────────────────────────────────────────────┐
│  upstream/     fetch raw payloads, no interpretation         │
│    client.ts   timeouts, conservative retry                  │
│    sources.ts  one function per endpoint                     │
├─────────────────────────────────────────────────────────────┤
│  domain/       normalization — the reason this service exists │
│    players.ts       alias resolution (loop-safe)             │
│    divisions.ts     name canonicalization                    │
│    results.ts       round/pool/team parsing                  │
│    index-builder.ts joins everything into an Index           │
├─────────────────────────────────────────────────────────────┤
│  store/        the current Index + refresh orchestration      │
│    store.ts        atomic swap, failure tolerance            │
│    scheduler.ts    tiered polling                            │
│    snapshot.ts     last-good corpus on disk                  │
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

Upstream sets no `ETag` or `Last-Modified`, so conditional requests are impossible. Instead we poll
what is cheap and fetch what is expensive only when something changed.

| Tier | Interval | Cost | Purpose |
| --- | --- | --- | --- |
| Directory probe | 60 s | 135 B | A live event started, changed or ended |
| Manifest probe | 10 min | 16 KB | A new ranking snapshot was published |
| Full refresh | 60 min | ~5 MB | Safety net for changes no probe can see |
| `POST /refresh` | on demand | ~5 MB | Pull results the moment they are entered |

A probe that detects a change escalates to a full refresh immediately. Steady-state upstream load
is roughly **1.5 KB/minute plus one 5 MB fetch per hour, regardless of our traffic** — because no
request ever triggers an upstream call.

The one exception is `GET /snapshots/{key}`, which fetches on demand. There are ~100 snapshots read
rarely; caching them all would cost significant memory for very little benefit.

## Two invariants in the store

**1. The index is swapped atomically.** `buildIndex()` returns a complete new `Index`, which
replaces the old reference in a single assignment. A request sees either the whole old index or the
whole new one — never a half-rebuilt mix. This is why the index is immutable and rebuilt wholesale
rather than mutated in place.

**2. A failed refresh never destroys good data.** The six sources are fetched in parallel but
tolerate individual failure, so one flaky service does not block the other four. Any source that
failed carries over its previous payload. If the three core sources (players, events, results) are
unavailable *and* there is no prior data, the refresh aborts and the old index keeps serving.

Concurrent `refresh()` calls share one in-flight promise rather than stampeding upstream.

## Surviving restarts

The last good corpus is written to `SNAPSHOT_PATH` after every successful refresh, using
write-then-rename so a crash mid-write cannot leave a truncated file.

On boot the service loads that snapshot and serves immediately, *then* refreshes from the network
in the background. A restart during an upstream outage therefore still serves data.

The snapshot stores the **raw** corpus, not the derived index. Normalization logic changes far more
often than upstream data does, and a snapshot of derived output would quietly serve yesterday's
bugs after a deploy.

## Error handling philosophy

Upstream has no referential integrity, so broken references are normal rather than exceptional. The
rule is **degrade and flag, never drop**:

- A team member whose GUID is missing from the directory is kept with `unknown: true`.
- Results referencing a non-existent event get a synthesized stub event.
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
| `domain/players.test.ts` | Alias chains, loops, dangling references, personal-field withholding |
| `domain/divisions.test.ts` | Every dirty division value observed in production |
| `domain/results.test.ts` | Round/pool parsing, malformed structures, hidden records |
| `domain/index-builder.test.ts` | Joins, stub events, the rankings/ratings split |
| `lib/matching.test.ts` | Fuzzy scoring, and refusing confidence on same-name-different-year |
| `app.test.ts` | HTTP contract: status codes, error shape, pagination, validation |

`app.test.ts` runs against a hydrated in-memory corpus via `store.hydrate()` — no network. Every
test input mirrors a real upstream quirk; where a test encodes a production oddity, a comment says
so, because otherwise it reads like an invented edge case and gets deleted.

## Deliberate non-goals

**No database.** Adding Postgres would mean managing a schema, migrations and sync for data that
fits in RAM and is not ours to own.

**No writes.** This service is strictly read-only. Upstream is the source of truth, and a write
path would need auth, conflict handling, and a trust relationship we do not have.

**No live scores yet.** The judging service holds only the currently-running event and discards
per-judge detail afterwards. The probe infrastructure is in place (`getEventDataVersion` is a
42-byte check) and `Index.live` already tracks it, but a live feed is a separate feature with its
own polling profile.

**No auto-linking.** `GET /match/*` ranks candidates and never picks one. Binding the wrong results
to an event is worse than showing none, and only a human can tell "German Championship 2026" from
"German Championship 2026 (Juniors)".
