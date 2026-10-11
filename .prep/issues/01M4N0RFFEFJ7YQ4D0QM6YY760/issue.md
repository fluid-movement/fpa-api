---
title: Canonicalize player ids in ranking and rating entries
kind: code
priority: high
---

`buildPointsSeries` in `src/domain/index-builder.ts` (rating entries ~line 139, ranking entries ~line 164) copies the upstream `entry.id` into `playerId` without passing it through `canonicalPlayerId`. Results are canonicalized, rankings and ratings are not. A player ranked under an alias GUID therefore appears in `GET /rankings` and `GET /ratings` with a non-canonical id. Their profile (`currentRankings`/`currentRatings` in `src/routes/players.ts`, which match `e.playerId === canonicalId`) also misses that standing. Found during the knowledge bootstrap survey.

## Open questions
