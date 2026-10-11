---
title: Decide the stack, storage and data flow for the profile editor
kind: decision
parent: 01M4N2FF7A80SQHMF2QAMFNKSJ
depends_on:
  - 01M4N2FFB70GV9SE7V23AVT651
tags:
  - profiles
---

Decide where the editing UI lives (Hono inside fpa-api, a separate SvelteKit app, or an admin area in fpa-events), where enrichment data is stored, and how fpa-api reads it. Authentication uses Better Auth.

## Open questions
