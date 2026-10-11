---
type: feature
title: Personal data withholding
description: Gender and membership number are withheld unless EXPOSE_PERSONAL_FIELDS is true
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:11Z
scope:
  - src/domain/players.ts
  - src/schemas/domain.ts
  - src/config.ts
confirmed_commit: a59faeb505252c7b1587a39ad9bf09b060c70a34
---

Player gender and FPA membership number are personal data and are withheld by default.

## Mechanism
- `config.exposePersonalFields` (`src/config.ts`) is true only when env `EXPOSE_PERSONAL_FIELDS === 'true'` (exact string; any other value, or unset, means withheld).
- The gate is applied once, when the player directory is built in `src/domain/players.ts`: `gender` and `membership` are set to `null` unless the flag is on, otherwise to the upstream value (or `null` if absent). Because the in-memory index holds the already-filtered record ([In-memory read model](/decisions/in-memory-read-model.md)), every endpoint that returns a `Player` (directory, profiles, ranking entries, `/match/players`) is consistent without per-route checks.
- `PlayerSchema` in `src/schemas/domain.ts` types both fields as nullable (`gender` string, `membership` number) and documents "Withheld unless EXPOSE_PERSONAL_FIELDS is enabled". The fields are always present in the JSON, so `null` means either withheld or unknown; clients cannot distinguish the two.

## Operating notes
- Changing the flag needs a restart, which rebuilds the index. Check whether a persisted snapshot is involved ([Snapshot persistence](/components/snapshot-persistence.md)); it stores raw data, so the gate is re-applied on rebuild.
- Keep it off in any publicly reachable deployment; the comment on the flag in `src/config.ts` says it should stay off unless the consumer has a legitimate need.
- New code that surfaces upstream player attributes must go through the same gate in `src/domain/players.ts` rather than copying fields straight from upstream.
