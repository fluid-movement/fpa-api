# Upstream

Where the data comes from, how it is shaped, and what is wrong with it.

This document is the reference for anyone touching the upstream or normalization layer. The
endpoint contract itself is [SYNC_API.md](SYNC_API.md); this page is about how fpa-api uses it and
which quirks of the data survive it.

---

## FullstackFreestyleTools

All data comes from [FullstackFreestyleTools](https://github.com/SmilesAir/FullstackFreestyleTools)
(freestylejudge.com), maintained by Ryan Young (GitHub: [SmilesAir](https://github.com/SmilesAir)).
It replaces the five AWS microservices (players, event summaries, results, points, live judging)
this service used to read; those are being retired.

We read two of its APIs, both from one base URL (`UPSTREAM_BASE_URL`):

| API | Added by | Holds |
| --- | --- | --- |
| Sync API, `/api/v1/sync/*` | Us, as a PR on our fork `fluid-movement/FullstackFreestyleTools` | Finished events with full placements, every player |
| Points API, `/api/v1/points/*` | Upstream, for ResultsRender | Ranking and rating snapshots |

The sync API is shaped for keeping a mirror up to date — a manifest of hashes, batched full events,
the player list — not for page views. The decisions behind it are in prep, issue
`01M849PHY6K1GNMYG1TVM8QYVY`.

## Endpoints consumed

All are public, unauthenticated `GET`s served through upstream's `publicGet` helper: CORS, rate
limits, `Cache-Control: public, max-age=60, s-maxage=600`. Errors are `{ "error": string }`.

| Endpoint | When | Used for |
| --- | --- | --- |
| `sync/manifest` | Every sync | One hash per finished event, one hash for the player list |
| `sync/events?ids=…` | Events new or changed since the last sync, ≤ 50 ids per call | Events, divisions, rounds, pools, placements |
| `sync/players` | When the players hash changed | Player directory, alias links, hidden flag |
| `points/getManifest` | Every sync | Snapshot index; picks each series' latest key |
| `points/downloadPointsData/{key}` | When a series' latest key changed; on demand for `GET /snapshots/{key}` | One ranking or rating snapshot |

A first sync costs about 20 calls; a quiet hour costs 2. Hashes are opaque: we only compare them for
equality with what we stored. See [ARCHITECTURE.md](ARCHITECTURE.md) for the sync loop.

---

## Finished events only

The sync API only ever contains **finished** events: not a test event, not `is_playing`,
`end_date` before today, at least one visible division with teams in round 1 or later, and every
such team placed. Events hidden from the Rankings Generator are included, as in the Points API.
fpa-api therefore never serves an event while it is being judged and has no notion of "live".

This replaces the old judging-service probes and pool-lock withholding. Pool locks are not used
upstream either: a missing `pools` row reads as unlocked, and imported events have none.

An event can leave the finished set again (an admin reopens it). It then disappears from the
manifest and fpa-api drops it; if it disappears between the manifest and the events call, the
events call leaves it out and fpa-api drops it too.

## How payloads become the corpus

`src/upstream/adapter.ts` converts the sync payloads into the `Raw*` shapes the domain normalizers
were written for (the old services' wire shapes), so the normalizers and their tests did not change.

| Sync payload | Becomes |
| --- | --- |
| `players[]` | `RawPlayersResponse.players` keyed by `id`; `aliasId` → `aliasKey`; `hidden` carried |
| `events[]` | `RawEvent` keyed by `id`; `fpaId`/`postName` → `additionalData` |
| `events[].divisions[]` | One `RawResult` per division, keyed by the division `id` (what rankings cite as `resultsId`) |
| `rounds[].pools[].teams[]` | `resultsData.round<N>.pool<X> = { poolId: X, teamData: [{ players, place, points }] }` |
| Latest snapshot per series | `RawPointsResponse.data[series]` |
| `points/getManifest` | `RawManifestResponse`, `createdAt` normalized to epoch ms |

Fields the new upstream does not have are simply absent: player `createdAt`/`lastActive`, event and
result `createdAt` are always `null` in the API now. Gender and membership are not sent at all.

### The join that matters

```
player.id ──┬─< events[].divisions[].rounds[].pools[].teams[].playerIds[]
            └─< ranking rows[].pointsList[] (via row .id)

division.id ═══ ranking rows[].pointsList[].resultsId
```

That last edge is the valuable one: it turns "1632 points" into a named list of events.

### Rankings vs ratings

Each snapshot holds one series. **Rankings and ratings are not the same shape and not the same
measurement.** Merging them is the single easiest way to ship a bug here — it silently produces
rank 0 / points 0 for every rated player.

```jsonc
// ranking-open, ranking-women — cumulative tournament points
{ "id": "guid", "fullName": "…", "rank": 1, "points": 1632, "resultsCount": 13,
  "pointsList": [ { "resultsId": "guid", "points": 360 } ] }

// rating-open — Elo-style strength estimate
{ "id": "guid", "fullName": "…", "rating": 1781.148, "matchCount": 1252,
  "highestRating": 1781.148, "highestRatingDate": "2026-04-26",
  "highestRank": 1, "highestRankDate": "2018-2-17" }
```

Ratings carry **no** `rank` field — rank is positional. They also cover far more people, most with
a `matchCount` too low to be meaningful.

There is no "latest points" endpoint. A series' current standings are its manifest entry with the
newest `createdAt` that is not hidden; the series is the key's prefix (`ranking-open_2026-11-5` →
`ranking-open`).

---

## Known data problems

The historic data was migrated from the old services and keeps their quirks. Every item here is
handled explicitly in the normalizer and covered by a test.

| Problem | Scale (old services) | How we handle it |
| --- | --- | --- |
| Duplicate players linked by `aliasId` | ~508 records, chains up to 3 deep | Resolved to a canonical player; alias GUIDs still accepted on lookup |
| **Alias loops** (A→B→A) | 0 today, but recurring | Iterative walk with a visited set; the cycle's lexicographically smallest id becomes canonical |
| `aliasId` pointing at a non-existent player | 1 | Chain stops at the last real player; warning emitted |
| Player id in a team but not in the player list | 1 | Kept, flagged `unknown: true`. Never dropped. |
| Inconsistent division names | `Open Coop`, `open pairs`, `Open pairs`, `undefined`, `Results`, `Open Test` | Normalized for grouping; `divisionRaw` preserved |
| Non-contiguous round numbers | Common | Rounds are read by number, not assumed sequential |
| Manifest dates not zero-padded (`2025-7-3`) | All | Normalized to `YYYY-MM-DD` |
| Hidden players | — | Left out of lists, search and matching; still named in results and placements |

Handled upstream now, so no longer seen here: lowercase pool keys (`poola` arrives as `"A"`), hidden
divisions and round 0 (never sent), results pointing at missing events (events carry their
divisions).

A hidden player is a property of the person: the canonical record's flag decides, and a hidden
duplicate does not hide the player it resolves to.

### The `points` trap

`teams[].points` means different things depending on the ruleset the event was judged under:

- **FPA2020** — a score; higher is better.
- **SimpleRanking** — a sum of judge ranks; **lower** is better.

The ruleset is not part of the payload, so points are not comparable across events. Always sort and
display by `place`.

---

## Working with the upstream maintainer

The sync API is our PR to Ryan's app; the Points API is his.

1. **The contract is [SYNC_API.md](SYNC_API.md).** `formatVersion` changes only on a breaking change;
   fpa-api refuses a manifest with a version it does not know and keeps serving the last good data.
2. **Request budget:** two small calls an hour when nothing changed, counted under the `sync` rate
   limit. Use `POST /refresh` for immediacy rather than a tighter interval.
3. **Production switches** only once the PR is merged and the historic data (including ranking
   history in `points_snapshots`) is migrated. Until then production reads the old services.
4. **Division normalization and alias loops** — offer to own the mapping rather than framing it as a
   data-quality complaint.
