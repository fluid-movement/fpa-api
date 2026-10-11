---
type: feature
title: Player profiles from fpa-profiles
description: How player profile enrichment (bio, nickname, links…) is pulled from fpa-profiles' export, validated by value shape, resolved to canonical players, and served on GET /players/{id}
status: draft
generated:
  by: claude-code/opus-5.5
  at: 2026-10-11T09:45:54Z
scope:
  - src/domain/profiles.ts
  - src/upstream/sources.ts
  - src/store/store.ts
  - src/routes/players.ts
  - src/schemas/domain.ts
confirmed_commit: 6d5c1ad18e50399efa9d51af7406f82243c41406
---

Player profile content (bio, nickname, headline, career highlights, partners, mentors, sponsors, links and similar) is not upstream data. It is edited in **fpa-profiles**, a separate SvelteKit app with its own Postgres, and seeded there from the old FPA WordPress site. This service only reads it, so it stays read-only and database-free ([In-memory read model](/decisions/in-memory-read-model.md)).

## Flow

1. `PROFILES_URL` (`config.profilesUrl`) names fpa-profiles. Unset disables the source: it is never fetched, its status on `/health` stays empty, and `Corpus.profiles` is `null`, so a stale copy is never served after disabling.
2. `sources.profiles()` fetches `${PROFILES_URL}/export` in `Store.#doRefresh`'s parallel block, on every full refresh and `POST /refresh` ([Store](/components/store.md), [Tiered refresh](/features/refresh-tiers.md)). It is not a core source: a failure records an error on `/health` and carries the previous export forward. The raw export is part of the persisted corpus ([Snapshot persistence](/components/snapshot-persistence.md)).
3. `buildProfiles` (`src/domain/profiles.ts`), called by `buildIndex`, produces `Index.profiles` keyed by canonical player id ([Index builder](/components/index-builder.md)).
4. `GET /players/{id}` returns `profile: { fields, updatedAt } | null`, for any of the player's ids ([Player alias resolution](/features/player-identity.md)).

fpa-profiles calls `POST /refresh` after each save (with this service's `REFRESH_TOKEN` as its `FPA_API_REFRESH_TOKEN`), so an edit is public within seconds; verified end to end on 2026-10-11 (3.2 s).

## The contract

The export is `{ version: 1, generatedAt, profiles: [{ playerId, updatedAt, fields }] }`. `buildProfiles` checks values **by shape, not by key**: a string, a list of strings, or a list of `{ kind, url (http/https), label? }`. A new field added in fpa-profiles therefore reaches the API without a release here, and which fields are public is decided only in fpa-profiles. `PlayerEnrichmentSchema` in `src/schemas/domain.ts` documents the known keys but accepts any.

## Degrade and flag

Following [Degrade and flag, never drop](/conventions/degrade-and-flag.md), each problem drops only what it affects and adds a `/health` warning: an envelope with another `version` (all profiles ignored), a value of the wrong shape (that value), a profile whose player no longer exists (that profile), two profiles resolving to one player after an upstream merge (the most recently updated wins).
