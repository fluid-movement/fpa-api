# components

## Entries

* [Configuration](/components/configuration.md) - Every environment variable in src/config.ts with its default, fail-closed behaviours, and why upstream URLs are configuration; read before adding or changing a setting
* [Build and deployment](/components/deployment.md) - Dockerfile (pnpm 11 pinned via corepack), Coolify settings, /app/data volume, liveness vs readiness health checks; read before touching the image or deploy setup
* [HTTP app](/components/http-app.md) - App assembly: CORS, the shared error shape, validation hook, 503 with Retry-After, /health vs /healthz, /docs
* [Index builder](/components/index-builder.md) - How `buildIndex()` joins the raw corpus into the immutable `Index` read model and what the Index holds
* [Results parsing](/components/results-parsing.md) - Parsing upstream results into rounds, pools and teams, including malformed and hidden records
* [Snapshot persistence](/components/snapshot-persistence.md) - Last-good raw corpus written atomically to `SNAPSHOT_PATH` and served on boot before the first network refresh
* [Store](/components/store.md) - The current Index: atomic swap, per-source failure carry-over, shared in-flight refresh, cold-start `IndexNotReady`
* [Upstream fetch layer](/components/upstream.md) - The five upstream services, the endpoints consumed, the client's timeouts and retry, and the raw types
