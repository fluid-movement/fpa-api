---
title: Serve player profiles from the public API
kind: code
parent: 01M4N2FF7A80SQHMF2QAMFNKSJ
tags:
  - profiles
---

fpa-api includes profile enrichment in its player responses (at least `GET /players/{id}`), keyed by canonical player id, following the read-only, refresh-driven architecture: the fpa-profiles JSON export is pulled as another source on the refresh tiers, persisted in the snapshot, and degraded and flagged when unavailable. The export format is decided in fpa-profiles (decision 01M4N3HPMTCYQ5MY1HB5FBSFXJ there); this issue starts once it is settled.

## Open questions

- Profile inline on the existing player response, or a separate endpoint?
