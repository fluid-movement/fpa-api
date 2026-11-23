Contract: `docs/SYNC_API.md`. Decisions linked on the issue are binding.

Code touched: `src/upstream/{sources,client,types}.ts` (new sources: sync manifest, sync events in batches of 50, sync players, points getManifest, downloadPointsData/{key}; judging sources and latestPoints removed), a new pure adapter `src/upstream/adapter.ts` that turns sync payloads into the existing Raw* types, a pure diff (`src/store/sync.ts`) that plans an incremental sync from stored hashes, `src/store/{store,scheduler,snapshot}.ts` (raw sync state persisted, SNAPSHOT_VERSION bumped, one sync interval), `src/domain/index-builder.ts` (live, liveLocks, in-progress withholding removed; hidden players tracked), `src/config.ts` (UPSTREAM_BASE_URL, SYNC_INTERVAL_MS), `src/routes/{admin,players,match}.ts`.

The domain normalizers (`src/domain/players.ts`, `results.ts`, `divisions.ts`) keep reading Raw*; the adapter must shape results exactly as `normalizeResult` expects (`round<N>` keys, `pool<X>` objects with `poolId` and `teamData`).

Docs: `docs/UPSTREAM.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `README.md`, `.env.example`; `openapi.json` regenerated with `pnpm spec`.
