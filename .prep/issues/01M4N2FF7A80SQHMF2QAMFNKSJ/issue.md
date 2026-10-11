---
title: Player profile enrichment
kind: manual
tags:
  - profiles
---

Players come from the upstream data this API consumes, but the profile content from the old FPA WordPress site (bio, nickname, hometown, career highlights, partners, mentors, sponsors and similar) is missing. A small authenticated editing application lets one person (possibly more later) enrich existing players with that kind of data. It never creates players: the upstream players are the basis, and enrichment attaches to them. The legacy WordPress dump (`u399401230_8oFzc.sql`, local only, never committed) seeds the data through a one-off import. fpa-api serves the enrichment as part of its public player data, so fpa-events can render it on its player pages.

## Open questions
