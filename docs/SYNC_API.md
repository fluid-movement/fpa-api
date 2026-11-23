# Sync API contract

The endpoints fpa-api syncs from, added to FullstackFreestyleTools (freestylejudge.com) by our PR.
This document is the contract between the two sides: the FullstackFreestyleTools implementation
and fpa-api's upstream layer are both written against it. Decisions behind it are in prep
(issue `01M849PHY6K1GNMYG1TVM8QYVY`).

Base URL: `https://freestylejudge.com` (fpa-api: `UPSTREAM_BASE_URL`).

All endpoints are public, read-only `GET`s served through FullstackFreestyleTools' `publicGet`
helper (CORS, rate limits, `Cache-Control: public, max-age=60, s-maxage=600,
stale-while-revalidate=3600`), counted under the rate-limit name `sync`. Errors are JSON
`{ "error": string }`.

## Finished events

The sync API only ever contains **finished** events. An event is finished when all of these hold:

- `events.is_test` is false and `events.is_playing` is false;
- `events.end_date` is before the current date;
- it has at least one *visible* division (`divisions.is_hidden` is not true) with a team in round 1
  or later;
- every team in round 1 or later of its visible divisions has a place (`teams.place` not null).

`events.is_hidden` (hidden from the Rankings Generator) does **not** exclude an event.

Inside a finished event, only visible divisions that have teams in round 1 or later appear, and only
rounds 1 and later (round 0, the unseeded roster, never appears).

## `GET /api/v1/sync/manifest`

```json
{
  "formatVersion": 1,
  "generatedAt": "2026-11-23T10:00:00.000Z",
  "players": { "hash": "9e107d9d372bb6826bd81d3542a419d6", "count": 3139 },
  "events": {
    "48721b44-142a-437d-9d6e-5979dd06435c": "e4d909c290d0fb1ca068ffaddf22cbd0"
  }
}
```

- `events` has one entry per finished event, keyed by event id. The value is the event's hash.
- A hash is the lowercase hex MD5 of the event object's JSON text **exactly as built in SQL**
  (`md5(event_json::text)` over the same `jsonb` the events endpoint returns). The manifest and
  the events endpoint are built from one shared SQL expression so they cannot disagree.
- `players.hash` is the MD5 of the players array (as returned by `sync/players`) built the same
  way; `players.count` is its length.
- `formatVersion` changes only on a breaking change to any payload in this document.

Hashes are opaque to the client: it only compares them for equality with what it stored.

## `GET /api/v1/sync/events?ids=<id>,<id>,…`

`ids` is a comma-separated list of 1 to 50 event ids. Missing, empty, more than 50, or any id that
is not a UUID: `400`. Ids that are unknown or not finished are left out of the answer (not an
error), so a client that asks for an event that just left the manifest gets fewer events back.

```json
{
  "events": [
    {
      "id": "48721b44-142a-437d-9d6e-5979dd06435c",
      "name": "FPAW 2026",
      "startDate": "2026-07-29",
      "endDate": "2026-08-02",
      "fpaId": null,
      "postName": null,
      "divisions": [
        {
          "id": "cc92e5ad-b2ee-421a-8d9c-996acf8dfeee",
          "name": "Mixed Pairs",
          "rounds": [
            {
              "number": 1,
              "pools": [
                {
                  "pool": "A",
                  "teams": [
                    { "place": 1, "points": 137.31, "playerIds": ["1993e4e6-…", "4f9222cb-…"] }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

- Events in the answer are in the order of `ids`, without duplicates.
- `divisions`: ordered by name, then id. `id` is the same id rankings use as `resultsId`.
- `rounds`: `number` 1 = Finals, 2 = Semifinals, 3 = Quarterfinals, 4 = Preliminaries, higher
  numbers occur in old data. Ascending. Numbers need not be contiguous.
- `pools`: `pool` is the letter, upper case (`teams.pool_id` `poolA`/`poola` → `"A"`). Ascending.
- `teams`: ordered by place, then team id. `place` is an integer; `points` is a number or null.
- `playerIds`: the **raw** `team_players.player_id` values in `team_players.id` order. They may be
  aliases: clients resolve them through `aliasId` from `sync/players`. A team may have no players.

## `GET /api/v1/sync/players`

```json
{
  "players": [
    {
      "id": "efdaaa1f-0f3d-4f42-8ede-c3330a5f9255",
      "firstName": "Francesco",
      "lastName": "Santolin",
      "country": "ITA",
      "fpaWebsiteId": null,
      "aliasId": null,
      "hidden": false
    }
  ]
}
```

- Every player, hidden ones included (`hidden: true`), ordered by id.
- `aliasId` is the player's `alias_id`: the entry this one is a duplicate of, or null. It may
  chain (an alias of an alias); clients follow it.
- No gender, membership, timestamps or other personal fields.

## Rankings and ratings

Unchanged and not part of this PR: the existing Points API.

- `GET /api/v1/points/getManifest`: every published snapshot,
  `{ manifest: { [key]: { key, date, divisionName, createdAt, dataPath, isHidden } } }`, key
  `<type>-<division>_<date>` (e.g. `ranking-open_2026-11-5`).
- `GET /api/v1/points/downloadPointsData/{key}`: `{ data: [...] }`, ranking rows
  `{ id, fullName, rank, points, resultsCount, pointsList: [{ resultsId, points }] }` or rating
  rows `{ id, fullName, rating, matchCount, highestRating, highestRatingDate, highestRank,
  highestRankDate }`.

There is no "latest points" endpoint: the latest snapshot of a series is the manifest entry for that
series with the newest `createdAt` that is not hidden.

## How fpa-api uses it

1. Poll `sync/manifest` and `points/getManifest` (hourly by default; `POST /refresh` forces it).
2. Fetch `sync/events` for every event id that is new or whose hash changed, in batches of 50.
   Drop stored events that are no longer in the manifest.
3. Fetch `sync/players` when `players.hash` changed.
4. Fetch `downloadPointsData` for a series' latest key when it changed.

A first start costs about 20 calls; a quiet hour costs 2.
