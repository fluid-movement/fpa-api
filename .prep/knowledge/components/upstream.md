---
type: component
title: Upstream fetch layer
description: The five upstream services, the endpoints consumed, the client's timeouts and retry, and the raw types
status: draft
generated:
  by: claude-code/sonnet
  at: 2026-10-11T08:18:38Z
scope:
  - src/upstream/**
confirmed_commit: 6d5c1ad18e50399efa9d51af7406f82243c41406
---

`src/upstream/` is the only code that talks to the network. It fetches and types raw payloads and interprets nothing; all interpretation lives in `src/domain/` (see [Index builder](/components/index-builder.md)). Long-form data notes: `docs/UPSTREAM.md`, sections "The five services", "Endpoints consumed" and "Caching characteristics".

## Services and endpoints

Five independent AWS services (players, events, results, points, judging) sharing one GUID namespace. Their base URLs come from `config.upstream.*` (env `UPSTREAM_PLAYERS|EVENTS|RESULTS|POINTS|JUDGING`, see [Configuration](/components/configuration.md)). `src/upstream/sources.ts` exports `sources`, one function per endpoint:

- `players` -> `getAllPlayers` (~759 KB), `events` -> `getAllEvents` (~228 KB)
- `results` -> `getAllResults` (~3.8 MB, the expensive one, never poll)
- `manifest` -> `getManifest` (16 KB, freshness probe), `latestPoints` -> `downloadLatestPointsData`, `pointsSnapshot(key)` -> `downloadPointsData/{key}` (different response shape, `RawPointsSnapshotResponse`)
- `directory` -> `getEventDirectory` (135 B), `eventDataVersion(key)` -> `getEventDataVersion/{key}` (42 B), `eventData(key)` -> `getEventData/{key}` (~247 KB; only consulted for per-pool `isLocked`, see [In-progress gating](/features/in-progress-event-gating.md))

Upstream sends no ETag, Last-Modified, Cache-Control or gzip, so conditional requests are impossible. That is why the store polls the tiny endpoints; see [Refresh tiers](/features/refresh-tiers.md).

## Client behaviour

`fetchJson<T>(url, attempts = 2)` in `src/upstream/client.ts`:

- Per-request timeout via `AbortSignal.timeout(config.requestTimeoutMs)` (`REQUEST_TIMEOUT_MS`, default 30 s).
- Non-2xx throws `UpstreamError` (carries `url` and `status`).
- One retry only, after `500 * attempt` ms, and only for transport errors/timeouts (no status) or 5xx. 4xx fails immediately.
- Any final failure is thrown as `UpstreamError`; the response body is cast to `T` with no runtime validation.

Callers (the store) catch these and record per-source health for `/health`.

## Raw types

`src/upstream/types.ts` holds `Raw*` interfaces (`RawPlayer`, `RawEvent`, `RawResult`/`RawResultsData`/`RawRound`/`RawPool`/`RawTeam`, `RawManifestResponse`, `RawRankingEntry`/`RawRatingEntry`, `RawDirectoryResponse`, `RawEventDataResponse`, ...). Fields are mostly optional because upstream data is dirty; the domain layer must treat every field as possibly missing. Results use dynamic keys (`round1`, `poolA`), so the domain scans keys; see [Results parsing](/components/results-parsing.md).
