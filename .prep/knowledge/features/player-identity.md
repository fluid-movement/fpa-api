---
type: feature
title: Player alias resolution
description: Canonical players from `aliasKey` chains, loop- and dangling-safe, and lookup by any alias GUID
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:40Z
scope:
  - src/domain/players.ts
confirmed_commit: 6d5c1ad18e50399efa9d51af7406f82243c41406
---

The same person can exist under several upstream GUIDs; a record's `aliasKey` points at its canonical entry (about 508 of 3138 in prod, chains up to 3 deep). `buildPlayers(raw)` in `src/domain/players.ts` resolves every GUID and returns `{ players, canonicalPlayerId, warnings }`.

## Resolution
`resolveCanonical(startId, raw)` walks the chain iteratively (no recursion) with a visited set:
- **Normal chain**: ends at the first record without `aliasKey`.
- **Loop** (A -> B -> A): the canonical id is the lexicographically smallest id in the cycle (only the cycle, not any tail leading in). Every member picks the same one, so each cycle keeps exactly one player; stopping where the loop was detected would make both disappear. A warning names the cycle.
- **Dangling alias** (target GUID missing): the record stays canonical itself, with a warning.

Pass 1 fills `canonicalPlayerId` for every GUID (aliases and canonicals). Pass 2 materializes only canonical players; each carries a sorted `aliasIds` list and `fpaWebsiteIds`, the legacy FPA website ids of the canonical record and all its aliases (its own first, de-duplicated). Upstream often left the legacy id on the duplicate record (127 of the 227 players with a legacy profile), so `fpaWebsiteId` alone hides it. `GET /players?fpaWebsiteId=` matches against `fpaWebsiteIds`.

## Lookup
`lookupPlayer(id, players, canonicalPlayerId)` accepts a canonical, alias or unknown GUID and always returns `{ id, fullName, unknown }`. Unknown ids come back as `Unknown Player` with `unknown: true` (original id kept), which [Results parsing](/components/results-parsing.md) uses so team members are never dropped; the [Index builder](/components/index-builder.md) then counts them in a warning. Player lookups by alias GUID go through `Index.canonicalPlayerId`.

## Details
- Names are trimmed; a blank full name becomes `Unknown Player`; blank `country` becomes null.
- `gender` and `membership` are null unless `config.exposePersonalFields` is set; see [Personal data](/features/personal-data.md).
- Failure handling follows [Degrade and flag](/conventions/degrade-and-flag.md).

## Rankings and ratings
Upstream ranks a player under whichever GUID they were entered with. `buildPointsSeries` maps every ranking and rating entry's `id` through `canonicalPlayerId`, so profiles find standings recorded under an alias. A series that lists one person under two alias ids keeps both entries and emits a warning.
