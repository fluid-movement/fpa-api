## The project

fpa-api is a read-only REST API (TypeScript, Hono + `@hono/zod-openapi`, Node ≥ 22.12, pnpm 11) over the freestyle frisbee community's competitive data. Upstream is five independent AWS microservices (players, events, results, points, judging) with no shared query layer, no referential integrity and no cache headers. Because the whole corpus is only about 5 MB, the service fetches everything, builds an immutable in-memory `Index` (alias-resolved players, canonical divisions, ranking points joined back to events) and serves every request from RAM. No request ever triggers an upstream call except `GET /snapshots/{key}`.

The code is layered: `src/upstream/` fetches raw payloads without interpreting them, `src/domain/` normalizes them with pure functions (`buildIndex()` is synchronous and I/O-free), `src/store/` holds the current Index, swaps it atomically, schedules tiered refreshes and persists the last good raw corpus to disk, and `src/routes/` are thin `createRoute()` handlers whose Zod schemas in `src/schemas/` are also the OpenAPI spec (`openapi.json` is committed, regenerated with `pnpm spec`). Config lives in `src/config.ts`, documented by `.env.example`.

Build with `pnpm build` (tsc into `dist/`), test with `pnpm test` (vitest, 113 tests over fixtures that mirror real upstream quirks, no network), typecheck with `pnpm check`. Deployment is a multi-stage Dockerfile on Coolify with a volume at `/app/data` and a liveness check on `/healthz`. There is no CI. The existing `docs/` (ARCHITECTURE, UPSTREAM, OPERATIONS, INTEGRATION) are thorough and current; entries should summarize the concept, point to the code and link the relevant doc section instead of copying it.

## Proposed entries

### Area 1: Upstream and its data

| Type | Path | Title | Description | Scope |
| --- | --- | --- | --- | --- |
| component | /components/upstream.md | Upstream fetch layer | The five upstream services, the endpoints consumed, the client's timeouts and retry, and the raw types | `src/upstream/**` |
| convention | /conventions/degrade-and-flag.md | Degrade and flag, never drop | How broken upstream references are kept, flagged and surfaced on /health instead of dropped | `src/domain/**`, `src/routes/admin.ts` |
| pitfall | /pitfalls/points-and-rounds.md | Team points and round numbering | Team `points` are not comparable across rulesets (sort by place) and round 1 is the final, rounds non-contiguous | `src/domain/results.ts`, `src/schemas/domain.ts` |
| feature | /features/in-progress-event-gating.md | Withholding in-progress events | Events are withheld until every judging pool is locked; `CONSUME_IN_PROGRESS_EVENTS` overrides | `src/domain/index-builder.ts`, `src/store/store.ts`, `src/upstream/sources.ts` |

### Area 2: Domain normalization and the Index

| Type | Path | Title | Description | Scope |
| --- | --- | --- | --- | --- |
| component | /components/index-builder.md | Index builder | How `buildIndex()` joins the raw corpus into the immutable `Index` read model and what the Index holds | `src/domain/index-builder.ts`, `src/domain/types.ts` |
| feature | /features/player-identity.md | Player alias resolution | Canonical players from `aliasKey` chains, loop- and dangling-safe, and lookup by any alias GUID | `src/domain/players.ts` |
| feature | /features/division-normalization.md | Division normalization | Canonical division names from dirty upstream values, and series key parsing | `src/domain/divisions.ts` |
| component | /components/results-parsing.md | Results parsing | Parsing upstream results into rounds, pools and teams, including malformed and hidden records | `src/domain/results.ts` |
| feature | /features/rankings-and-ratings.md | Rankings, ratings and snapshots | Tournament-point rankings vs Elo ratings, joining points to events, series, and on-demand historical snapshots | `src/domain/index-builder.ts`, `src/routes/rankings.ts`, `src/routes/ratings.ts`, `src/routes/snapshots.ts` |

### Area 3: Store, refresh and persistence

| Type | Path | Title | Description | Scope |
| --- | --- | --- | --- | --- |
| component | /components/store.md | Store | The current Index: atomic swap, per-source failure carry-over, shared in-flight refresh, cold-start `IndexNotReady` | `src/store/store.ts` |
| feature | /features/refresh-tiers.md | Tiered refresh | Directory and manifest probes escalating to full refreshes, the hourly floor, and token-protected `POST /refresh` | `src/store/scheduler.ts`, `src/routes/admin.ts`, `src/config.ts` |
| component | /components/snapshot-persistence.md | Snapshot persistence | Last-good raw corpus written atomically to `SNAPSHOT_PATH` and served on boot before the first network refresh | `src/store/snapshot.ts` |
| decision | /decisions/in-memory-read-model.md | In-memory read model, no database, no writes | Why the corpus lives in RAM, the service is read-only and the snapshot stores raw rather than derived data | `src/store/**`, `src/domain/index-builder.ts` |

### Area 4: HTTP API

| Type | Path | Title | Description | Scope |
| --- | --- | --- | --- | --- |
| component | /components/http-app.md | HTTP app | App assembly: CORS, the shared error shape, validation hook, 503 with Retry-After, `/health` vs `/healthz`, `/docs` | `src/app.ts`, `src/lib/http.ts`, `src/index.ts` |
| convention | /conventions/routes-and-schemas.md | Defining routes and schemas | `createRoute()` with Zod schemas as the single source for validation, types and OpenAPI; pagination; regenerate `openapi.json` | `src/routes/**`, `src/schemas/**`, `scripts/generate-openapi.ts`, `openapi.json` |
| feature | /features/candidate-matching.md | Candidate matching | `/match/events` and `/match/players` rank fuzzy candidates for linking and never pick one | `src/lib/matching.ts`, `src/routes/match.ts` |
| feature | /features/personal-data.md | Personal data withholding | Gender and membership number are withheld unless `EXPOSE_PERSONAL_FIELDS` is true | `src/domain/players.ts`, `src/schemas/domain.ts`, `src/config.ts` |

### Area 5: Project conventions, configuration and operations

| Type | Path | Title | Description | Scope |
| --- | --- | --- | --- | --- |
| convention | /conventions/layering.md | Layering rules | upstream never interprets, domain never does I/O, routes never compute | `src/**` |
| convention | /conventions/testing.md | Testing | Fixture-based tests that mirror real upstream quirks (commented as such), `store.hydrate()` for HTTP tests, no network | `src/**/*.test.ts`, `vitest.config.ts` |
| component | /components/configuration.md | Configuration | Every environment variable, its default and why upstream URLs are configuration | `src/config.ts`, `.env.example` |
| component | /components/deployment.md | Build and deployment | Dockerfile with pinned pnpm 11 via corepack, Coolify settings, volume, health checks | `Dockerfile`, `.dockerignore`, `package.json` |
| feature | /features/fpa-events-integration.md | fpa-events integration | How the fpa-events app consumes this API: the three features, rendering rules, caching | `docs/INTEGRATION.md` |

## Gaps found during the survey

- `dist/` build output is committed although it is not ignored and the Docker build ignores it; it is currently in sync with `src/`.
- There is no CI running `pnpm check`, `pnpm test` and an `openapi.json` drift check.
