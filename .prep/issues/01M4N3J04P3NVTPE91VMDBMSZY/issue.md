---
title: Find players by legacy website id across aliases
kind: code
parent: 01M4N2FF7A80SQHMF2QAMFNKSJ
tags:
  - profiles
---

Each upstream player record can carry `fpaWebsiteId`, the player's id on the legacy FPA WordPress site. For 127 of the 227 players with a legacy profile, that id sits on an alias record, and `/players` only exposes the canonical record's `fpaWebsiteId`, so the legacy id is invisible through the API. Collect the legacy ids of a canonical player and all its aliases during alias resolution, expose them on the player, and let a client look a player up by legacy id. The fpa-profiles import (fpa-profiles issue 01M4N3HPSYVGR3MG9WFJX9YGQX) matches through this instead of re-implementing alias resolution; fpa-events can link legacy URLs the same way.

## Open questions

- A list field on the player (`fpaWebsiteIds`), a lookup endpoint, or a query filter on `/players`?
