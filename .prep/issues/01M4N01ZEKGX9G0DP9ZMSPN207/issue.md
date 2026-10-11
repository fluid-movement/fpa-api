---
title: Add CI for typecheck, tests and OpenAPI drift
kind: code
---

There is no CI. Pull requests and pushes to main should run `pnpm check`, `pnpm test`, and `pnpm spec` followed by a check that `openapi.json` is unchanged, since the committed spec is meant to be a reviewable diff of the API surface (docs/ARCHITECTURE.md, "OpenAPI").

## Open questions
