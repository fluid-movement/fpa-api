# Upstream

Where the data comes from, how it is shaped, and what is wrong with it.

This document is the reference for anyone touching the normalization layer. Every quirk listed
here was observed in production data, not inferred from documentation — upstream publishes no
schema and offers no contract.

---

## The five services

All are serverless (API Gateway + Lambda + DynamoDB + an S3 cache) in `us-west-2`, maintained by
Ryan Young (GitHub: [SmilesAir](https://github.com/SmilesAir)).

| Service | Repo | Holds |
| --- | --- | --- |
| Player names | [`PlayerNameService`](https://github.com/SmilesAir/PlayerNameService) | ~3100 players: name, country, gender, membership, alias links |
| Event summaries | [`EventSummaryService`](https://github.com/SmilesAir/EventSummaryService) | ~910 events: name, start/end date, legacy FPA website id |
| Event results | [`EventResultsService`](https://github.com/SmilesAir/EventResultsService) | ~1490 division results: pools, placements, points |
| Points/rankings | [`PointsService`](https://github.com/SmilesAir/PointsService) | Current standings + ~100 dated snapshots |
| Live judging | [`FreestyleJudge`](https://github.com/SmilesAir/FreestyleJudge) | **Only the one currently-running event** |

They share **one GUID namespace**. A player or event key is the same value in every service, which
is the only reason cross-service joining is possible at all.

## Endpoints consumed

All are public, unauthenticated `GET`s with `CORS: *`.

| Endpoint | Size | Used for |
| --- | --- | --- |
| `{players}/getAllPlayers` | 759 KB | Player directory |
| `{events}/getAllEvents` | 228 KB | Event summaries |
| `{results}/getAllResults` | **3.8 MB** | All results. The expensive one. |
| `{points}/getManifest` | 16 KB | Snapshot index — also a freshness probe |
| `{points}/downloadLatestPointsData` | 682 KB | Current rankings and ratings |
| `{points}/downloadPointsData/{key}` | ~96 KB | One historical snapshot, on demand |
| `{judging}/getEventDirectory` | **135 B** | Live event — the cheap freshness probe |
| `{judging}/getEventDataVersion/{key}` | **42 B** | Live event version probe |
| `{judging}/getEventData/{key}` | ~247 KB | Pool lock state. Only for directoried events, only when the version moved. |

### Caching characteristics

- **No `ETag`, no `Last-Modified`, no `Cache-Control`.** Conditional requests are impossible.
- **No gzip.** `Accept-Encoding: gzip` is ignored; 3.8 MB is 3.8 MB on the wire.
- Upstream Lambdas serve from their own S3 cache, invalidated via a dirty-flag in an `infoTable`.
  That flag is not exposed, which is why we poll.

This is the constraint that shapes the whole refresh strategy — see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Data shapes

### Player

```jsonc
{
  "key": "22a14ecd-…",
  "firstName": "Jean-Marie",
  "lastName": "Abel",
  "country": "",            // often empty
  "gender": "M",            // 'M' | 'F' | 'X', not enforced
  "membership": 0,          // 0 means "none", not "member #0"
  "fpaWebsiteId": "2422",   // id on the legacy FPA WordPress site
  "aliasKey": "4eebb67b-…", // present on ~508 of ~3138 records
  "createdAt": 1759844088562,
  "lastActive": 1759844088562
}
```

### Event

```jsonc
{
  "key": "b5e6e8f3-…",
  "eventName": "1995 New England Championships",
  "startDate": "1995-09-29",   // YYYY-MM-DD
  "endDate": "1995-09-30",
  "createdAt": 1760681626734,
  "additionalData": { "fpaId": "1159", "postName": "1995-new-england-championships" }
}
```

### Result

One record is **one division at one event**.

```jsonc
{
  "key": "27aa579e-…",
  "eventId": "75cc5a34-…",       // joins to Event.key
  "eventName": "AIFDA Japan Beach Disc Fiesta (October 2022)",
  "divisionName": "Open Pairs",
  "createdAt": 1672339324077,
  "rawText": "start pools …",    // the original text entry, kept as an audit trail
  "resultsData": {
    "divisionName": "Open Pairs",
    "eventId": "75cc5a34-…",
    "isHidden": false,           // present on 2 records
    "round1": {
      "id": 1,
      "poolA": {
        "poolId": "A",
        "teamData": [
          { "players": ["guid", "guid"], "place": 1, "points": 0 }
        ]
      }
    }
  }
}
```

### Rankings vs ratings

Both arrive from `downloadLatestPointsData` under `data`, keyed by series name. **They are not the
same shape and not the same measurement.** Merging them is the single easiest way to ship a bug
here — it silently produces rank 0 / points 0 for every rated player.

```jsonc
// ranking-open, ranking-women — cumulative tournament points
{ "id": "guid", "fullName": "…", "rank": 1, "points": 1632, "resultsCount": 13,
  "pointsList": [ { "resultsId": "guid", "points": 360 } ] }

// rating-open — Elo-style strength estimate
{ "id": "guid", "fullName": "…", "rating": 1781.148, "matchCount": 1252,
  "highestRating": 1781.148, "highestRatingDate": "2026-04-26",
  "highestRank": 1, "highestRankDate": "2018-2-17" }
```

Ratings carry **no** `rank` field — rank is positional. They also cover far more people (2265 vs
341), most with a `matchCount` too low to be meaningful.

### The join that matters

```
player.key ──┬─< results[].resultsData.round{N}.pool{X}.teamData[].players[]
             └─< rankings[].pointsList[] (via entry .id)

event.key ═══ results[].eventId ═══ judging eventKey

results.key ═══ rankings[].pointsList[].resultsId
```

That last edge is the valuable one: it turns "1632 points" into a named list of events.

---

## Known data problems

Every item here is handled explicitly in the normalizer and covered by a test.

| Problem | Scale | How we handle it |
| --- | --- | --- |
| Duplicate players linked by `aliasKey` | 508 records, chains up to 3 deep | Resolved to a canonical player; alias GUIDs still accepted on lookup |
| **Alias loops** (A→B→A) | 0 today, but recurring | Iterative walk with a visited set; the cycle's lexicographically smallest id becomes canonical |
| `aliasKey` pointing at a non-existent player | 1 | Chain stops at the last real player; warning emitted |
| Player GUID in results but not in the directory | 1 | Kept, flagged `unknown: true`. Never dropped. |
| `eventId` in results with no matching event | 2 (both test data) | A stub event is synthesized so the results survive |
| Inconsistent division names | `Open Coop`, `open pairs`, `Open pairs`, `undefined`, `Results`, `Open Test` | Normalized for grouping; `divisionRaw` preserved |
| Lowercase pool keys (`poola`) | 4 | Matched case-insensitively |
| Non-contiguous round numbers | Common | Rounds are read by number, not assumed sequential |
| `isHidden` results | 2 | Excluded from output |
| Events still being judged | 0-1 at a time | Event and its partial results withheld until every pool is `isLocked` |
| `showInDirectory` left true after an event ends | Routinely, for weeks | Never trusted alone; pool locks decide |
| Manifest dates not zero-padded (`2025-7-3`) | All | Normalized to `YYYY-MM-DD` |

### The `points` trap

`teamData[].points` means different things depending on the ruleset the event was judged under:

- **FPA2020** — a score; higher is better.
- **SimpleRanking** — a sum of judge ranks; **lower** is better.

The `rulesId` lives in the judging system's event blob, which is discarded once an event ends, so
**the results data does not tell you which ruleset produced it**. Points are therefore not
comparable across events. Always sort and display by `place`.

### Pool locks are the finished signal

There is **no "is this running" flag on the event record.** `getAllEvents` returns whole DynamoDB
items, and across all 912 events the complete key set is `key, eventName, startDate, endDate,
createdAt, additionalData{fpaId, postName}`. `setEventSummary` writes exactly those five fields.

The flag is `isLocked`, and it lives **per pool** in the judging service. A head judge locks a pool
when its scoring is final (`POST /updatePoolLocked/{poolKey}/isLocked/{isLocked}`), and the flags
are readable on `getEventData/{key}` under `eventData.eventData.poolMap` — note the doubled
nesting. An event has finished when every pool is locked.

**Presence in `getEventDirectory` does not mean "running".** `showInDirectory` is set when an event
is imported and cleared only by a manual admin call (`removeEventFromDirectory`). In production the
directory listed FPAW 2026 — which ended 2026-08-02 and had four complete division results — until
well into September. Filtering on directory presence alone would have withheld a finished event
indefinitely; the pool locks are what disambiguate it.

Two further consequences:

- Locking a pool bumps the event's `minorVersion` but leaves the `getEventDirectory` payload
  byte-identical, so the 60 s directory probe has to fold the per-event version probes into its
  signature or it will not notice an event finishing.
- Upstream's own ranking `points` and `rank` totals still include a running event. We can decline
  to attribute points to a withheld event, but we cannot recompute the totals.

Handled in `findInProgress` (`src/domain/index-builder.ts`); override with
`CONSUME_IN_PROGRESS_EVENTS=true`.

### Live judging data is ephemeral

`getEventDirectory` returns only the event currently being judged. Per-judge score breakdowns are
not retained after an event finishes — the durable record is the aggregated `EventResultsService`
entry. Anything richer than final placements has to be captured while the event is running.

---

## Working with the upstream maintainer

We have no contract and no credentials. Consuming these endpoints depends on goodwill, so:

1. **Confirm consumption is welcome** and agree a rough request budget. Our steady state is
   ~1.5 KB/minute of probes plus one ~5 MB fetch per hour, independent of our traffic.
2. **Ask for warning before redeploys or auth changes.** The API Gateway IDs are hardcoded in his
   clients; a redeploy under new IDs breaks us until the env vars are repointed.
3. **Two small asks with high payoff:** exposing the existing `infoTable` dirty-flag as a version
   endpoint (or an `ETag`) would let us drop polling entirely, and enabling gzip would cut the
   3.8 MB results payload by roughly 10x.
4. **Division normalization** — offer to own the mapping rather than framing it as a data-quality
   complaint. Same for alias loops, which his own README documents as a known issue.
