---
title: Serve player profiles from the public API
kind: code
parent: 01M4N2FF7A80SQHMF2QAMFNKSJ
depends_on:
  - 01M4N2FFEHEJJ887BEY88PZGFE
  - 01M4N2FFHKBV8MB99QJ3NQJ5EZ
tags:
  - profiles
---

fpa-api includes the enrichment in its player responses (at least `GET /players/{id}`), keyed by canonical player id, following the read-only, refresh-driven architecture.

## Open questions

- Profile inline on the existing player response, or a separate endpoint?
