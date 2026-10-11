---
type: convention
title: Testing
description: 'How tests are written: fixtures mirroring real upstream quirks (commented), store.hydrate() for HTTP tests, mocked sources, no network'
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:19:39Z
scope:
  - src/**/*.test.ts
  - vitest.config.ts
  - .github/workflows/**
confirmed_commit: 6d5c1ad18e50399efa9d51af7406f82243c41406
---

`pnpm test` runs `vitest run` (config in `vitest.config.ts`: node environment, `src/**/*.test.ts`). Tests are colocated with the code they cover and never touch the network.

## What is covered

- `src/domain/players.test.ts`: alias chains, loops, dangling references, personal-field withholding.
- `src/domain/divisions.test.ts`: the real dirty division strings seen in production.
- `src/domain/results.test.ts`: round/pool parsing, malformed structures, hidden records.
- `src/domain/index-builder.test.ts`: joins, stub events, rankings/ratings split.
- `src/lib/matching.test.ts`: fuzzy scoring; refusing confidence for same-name-different-year.
- `src/lib/auth.test.ts`: constant-time token comparison.
- `src/store/snapshot.test.ts`: snapshot round-trip and every unusable-file case, against a temporary `SNAPSHOT_PATH` set with `vi.stubEnv` plus `vi.resetModules()` (config is read at import).
- `src/store/store.test.ts`: refresh behaviour, with upstream replaced via `vi.mock('../upstream/sources.js', ...)` and `mockResolvedValue` fetchers.
- `src/app.test.ts`: the HTTP contract (status codes, error shape, pagination, validation).

## Rules

- **Fixtures mirror real quirks, and say so.** Test inputs reproduce things production data actually does (for example "One real record in production does exactly this" in `players.test.ts` and `index-builder.test.ts`). Keep that comment; without it the case reads as an invented edge case and gets deleted.
- **HTTP tests use `store.hydrate(corpus)`** (`src/store/store.ts`) to load a hand-built `Corpus` straight into the store, then call the Hono app. No server, no fetch. `app.test.ts` re-hydrates to test the 503-before-load and degraded cases.
- **Domain tests call the pure functions directly** with `Raw*` fixtures; no mocks needed, which is the payoff of the layering convention (see [Layering rules](/conventions/layering.md)).
- `config` is a module-level constant read at import, so config-driven behaviour (personal fields, in-progress events) needs that in mind when testing both modes.

Related: [Degrade and flag](/conventions/degrade-and-flag.md) (tests assert flagged-not-dropped); `docs/ARCHITECTURE.md`, section "Testing". `pnpm check` (`tsc --noEmit`) is the separate typecheck.

## CI
`.github/workflows/ci.yml` runs on pull requests and pushes to main: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, then `pnpm spec` and fails if `openapi.json` changed. Commit the regenerated spec with any route or schema change ([Defining routes and schemas](/conventions/routes-and-schemas.md)).
