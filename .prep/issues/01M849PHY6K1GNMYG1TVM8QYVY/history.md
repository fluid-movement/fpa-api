- 2026-11-23T13:41:00Z edited by claude-code: requirement

- 2026-11-23T13:48:05Z claude-code: Upstream rewritten against docs/SYNC_API.md: sources, pure adapter into Raw*, pure sync diff, incremental store with last-good, snapshot v2, SYNC_INTERVAL_MS; live/judging/in-progress/EXPOSE_PERSONAL_FIELDS removed; hidden players filtered from lists and matching. pnpm check clean, 161 tests pass.

- 2026-11-23T13:50:51Z claude-code: Docs rewritten (UPSTREAM, ARCHITECTURE, OPERATIONS, INTEGRATION, README, .env.example). Smoke run against a fake contract server: first sync 4 requests, restart from snapshot 2 requests with no changes; hidden player left out of /players and still named in results. localhost:3100 not reachable, so the real-server check is still pending; issue stays in progress.
