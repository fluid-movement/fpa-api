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
confirmed_commit: a59faeb505252c7b1587a39ad9bf09b060c70a34
---

The same person can exist under several upstream GUIDs; a record's `aliasKey` points at its canonical entry (about 508 of 3138 in prod, chains up to 3 deep). `buildPlayers(raw)` in `src/domain/players.ts` resolves every GUID and returns `{ players, canonicalPlayerId, warnings }`.

## Resolution
`resolveCanonical(startId, raw)` walks the chain iteratively (no recursion) with a visited set:
- **Normal chain**: ends at the first record without `aliasKey`.
- **Loop** (A -> B -> A): the canonical id is the lexicographically smallest id in the cycle (only the cycle, not any tail leading in). Every member picks the same one, so each cycle keeps exactly one player; stopping where the loop was detected would make both disappear. A warning names the cycle.
- **Dangling alias** (target GUID missing): the record stays canonical itself, with a warning.

Pass 1 fills `canonicalPlayerId` for every GUID (aliases and canonicals). Pass 2 materializes only canonical players; each carries a sorted `aliasIds` list.

## Lookup
`lookupPlayer(id, players, canonicalPlayerId)` accepts a canonical, alias or unknown GUID and always returns `{ id, fullName, unknown }`. Unknown ids come back as `Unknown Player` with `unknown: true` (original id kept), which [Results parsing](/components/results-parsing.md) uses so team members are never dropped; the [Index builder](/components/index-builder.md) then counts them in a warning. Player lookups by alias GUID go through `Index.canonicalPlayerId`.

## Details
- Names are trimmed; a blank full name becomes `Unknown Player`; blank `country` becomes null.
- `gender` and `membership` are null unless `config.exposePersonalFields` is set; see [Personal data](/features/personal-data.md).
- Failure handling follows [Degrade and flag](/conventions/degrade-and-flag.md).

## Gap
Ranking and rating entries keep the upstream `id` as `playerId` without going through `canonicalPlayerId` (`src/domain/index-builder.ts:140,165`), so an aliased id there is not merged.
