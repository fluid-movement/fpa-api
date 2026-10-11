---
title: Import legacy profiles from the WordPress dump
kind: code
parent: 01M4N2FF7A80SQHMF2QAMFNKSJ
depends_on:
  - 01M4N2FFEHEJJ887BEY88PZGFE
  - 01M4N2FFHKBV8MB99QJ3NQJ5EZ
tags:
  - profiles
---

A one-off import script reads the local dump and writes the profile store, matching legacy players to upstream players. It is run once and not kept as a committed migration.

## Open questions

- Which of the duplicate legacy profiles wins?
