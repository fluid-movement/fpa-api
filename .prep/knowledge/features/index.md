# features

## Entries

* [Candidate matching](/features/candidate-matching.md) - /match/events and /match/players rank fuzzy candidates for linking and never pick one
* [Division normalization](/features/division-normalization.md) - Canonical division names from dirty upstream values, and series key parsing
* [fpa-events integration](/features/fpa-events-integration.md) - How the fpa-events SvelteKit app consumes this API: three features, mandatory rendering rules (sort by place, round 1 is final, unknown members, 503), caching; read when changing response shapes
* [Withholding in-progress events](/features/in-progress-event-gating.md) - Events are withheld until every judging pool is locked; CONSUME_IN_PROGRESS_EVENTS overrides
* [Personal data withholding](/features/personal-data.md) - Gender and membership number are withheld unless EXPOSE_PERSONAL_FIELDS is true
* [Player alias resolution](/features/player-identity.md) - Canonical players from `aliasKey` chains, loop- and dangling-safe, and lookup by any alias GUID
* [Rankings, ratings and snapshots](/features/rankings-and-ratings.md) - Tournament-point rankings vs Elo ratings, joining points to events, series, and on-demand historical snapshots
* [Tiered refresh](/features/refresh-tiers.md) - Directory and manifest probes escalating to full refreshes, the hourly floor, and token-protected `POST /refresh`
