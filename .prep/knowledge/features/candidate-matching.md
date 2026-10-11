---
type: feature
title: Candidate matching
description: /match/events and /match/players rank fuzzy candidates for linking and never pick one
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:11Z
scope:
  - src/lib/matching.ts
  - src/routes/match.ts
confirmed_commit: 6d5c1ad18e50399efa9d51af7406f82243c41406
---

`GET /match/events` and `GET /match/players` (`src/routes/match.ts`) help a client (typically fpa-events) find the upstream record that corresponds to one of its own. They return ranked suggestions and never link automatically: fpa-events and the upstream services share no identifier, and binding the wrong results to an event is worse than showing none. A human must confirm before the id is stored. Even `confident: true` means only "near-certain".

## Scoring (`src/lib/matching.ts`)
`rankCandidates(candidates, query, accessors, limit = 10)`:
- `tokenize` lowercases, strips non-alphanumerics, drops one-character tokens and stopwords (`championship`, `open`, `freestyle`, `the`, ...).
- `nameSimilarity` is Jaccard similarity over the token sets.
- `dateProximity` is 1.0 on the same day, decaying linearly to 0 at 30 days; 0 if either date is missing or unparseable.
- `score` is `0.7*name + 0.3*date` when a query date is given, otherwise name alone.
- `confident` requires `nameScore >= 0.8` and (no query date or `dateScore >= 0.9`).
- Candidates scoring 0.15 or less are dropped; the top 10 are returned, best first. Scores are rounded to 3 decimals in the route.

## Endpoints
- Events: query `name`, optional `startDate`, optional `hasResults`. By default only events with `resultCount > 0` are considered; pass `hasResults=false` to include the rest. Items carry `event`, `score`, `nameScore`, `dateScore`, `confident`.
- Players: query `name` only, matched against `fullName`. Items carry `player`, `score`, `confident` and `placementCount`, a tiebreaker because several people share a name and an active player is likelier. Personal fields on `player` follow [Personal data](/features/personal-data.md).

## Pitfalls
Recurring annual events have near-identical names, and a confident match can still be the wrong year or a juniors division. Both handlers use `store.requireIndex()` and answer 503 until the index is loaded.
