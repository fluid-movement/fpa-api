---
type: feature
title: fpa-events integration
description: 'How the fpa-events SvelteKit app consumes this API: three features, mandatory rendering rules (sort by place, round 1 is final, unknown members, 503), caching; read when changing response shapes'
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:49Z
scope:
  - docs/INTEGRATION.md
confirmed_commit: a59faeb505252c7b1587a39ad9bf09b060c70a34
---

fpa-events (SvelteKit) is the one known consumer. Full guide: `docs/INTEGRATION.md`; this entry is the contract summary. Changing response shapes affects it, so keep `openapi.json` accurate ([Routes and schemas](/conventions/routes-and-schemas.md)).

## Principles

- **Server-side only.** fpa-events calls the API from its backend (remote functions in `data.remote.ts`), via a thin client in `src/lib/server/results/client.ts` using `RESULTS_API_URL` (e.g. `http://fpa-api:3000`). No CORS and no public exposure needed, so `CORS_ORIGINS` stays unset ([Configuration](/components/configuration.md)).
- **Results are supplementary.** Treat `503` (loading or upstream down) as "omit the results section", never fail the page.

## The three features

1. **Rankings page**: division switcher from `GET /rankings/series`, standings from `GET /rankings?series=...`; each entry's `breakdown` lists the events that produced its points. A ratings tab (`GET /ratings`) must always pass `minMatchCount` (50-100), since most rated players have too few matches. See [Rankings and ratings](/features/rankings-and-ratings.md).
2. **Results on event pages**: needs a nullable `fpaEventKey` on fpa-events' `events`, set by an admin via `GET /match/events?name=&startDate=`. **Never auto-link, even when `confident: true`**; it only means "show first". Render `GET /events/{key}/results` as rounds, pools, teams; hide the section when unlinked. See [Candidate matching](/features/candidate-matching.md).
3. **Dashboard metrics**: `fpaPlayerKey` on the user, confirmed by the user via `GET /match/players?name=`; then `GET /players/{key}` returns rank, points, rating with `matchCount`, `stats` and `placements`. See [Player identity](/features/player-identity.md).

## Rendering rules

- Sort by `place`, never `points` (direction differs by ruleset). See [Points and rounds](/pitfalls/points-and-rounds.md).
- Round 1 is the final; rounds count backwards and are not contiguous; use `roundName`.
- Render `unknown: true` team members as "Unknown Player" rather than filtering them ([Degrade and flag](/conventions/degrade-and-flag.md)).
- Always show `matchCount` beside a rating.
- Render `profile.fields` on player pages by value shape, not by a fixed key list: string as text (`bio` as sanitized Markdown), string list as names, `{ kind, url, label? }` list as links; hide missing keys. See [Player profiles](/features/player-profiles.md).

## Caching and freshness

The API serves from memory, so calling per render is fine; an optional TTL in fpa-events of 1-5 minutes. The API itself refreshes on [tiers](/features/refresh-tiers.md) (hourly floor); for immediate visibility wire an admin "refresh results" button to `POST /refresh` with the bearer token.
