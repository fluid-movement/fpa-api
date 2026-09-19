/**
 * Runtime configuration.
 *
 * Every upstream base URL is an env var on purpose. They are AWS API Gateway
 * IDs owned by a third party; if those services are ever redeployed the IDs
 * change, and we need to be able to repoint without a code change.
 */
function env(name, fallback) {
    const value = process.env[name];
    return value && value.length > 0 ? value : fallback;
}
function intEnv(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error(`Invalid ${name}: expected a positive integer, got "${raw}"`);
    }
    return parsed;
}
const SECOND = 1000;
const MINUTE = 60 * SECOND;
export const config = {
    port: intEnv('PORT', 3000),
    /** Upstream service base URLs (no trailing slash). */
    upstream: {
        players: env('UPSTREAM_PLAYERS', 'https://4wnda3jb78.execute-api.us-west-2.amazonaws.com/production'),
        events: env('UPSTREAM_EVENTS', 'https://wyach4oti8.execute-api.us-west-2.amazonaws.com/production'),
        results: env('UPSTREAM_RESULTS', 'https://v869a98rf9.execute-api.us-west-2.amazonaws.com/production'),
        points: env('UPSTREAM_POINTS', 'https://kvq5a3et4b.execute-api.us-west-2.amazonaws.com/production'),
        judging: env('UPSTREAM_JUDGING', 'https://xf4cu1wy10.execute-api.us-west-2.amazonaws.com/production')
    },
    /** How long a single upstream request may take before we give up on it. */
    requestTimeoutMs: intEnv('REQUEST_TIMEOUT_MS', 30 * SECOND),
    /**
     * Tiered refresh. Upstream exposes no ETag/Last-Modified, so we cannot make
     * conditional requests. Instead we poll two tiny endpoints often and pull the
     * ~5 MB corpus rarely — triggered by those probes, with a slow safety net.
     */
    refresh: {
        /** Full corpus refetch floor, even if no probe fires. */
        fullIntervalMs: intEnv('FULL_REFRESH_INTERVAL_MS', 60 * MINUTE),
        /** `getEventDirectory` — 135 bytes. Detects a live event starting/ending. */
        directoryProbeIntervalMs: intEnv('DIRECTORY_PROBE_INTERVAL_MS', 60 * SECOND),
        /** `getManifest` — 16 KB. Detects a newly published ranking snapshot. */
        manifestProbeIntervalMs: intEnv('MANIFEST_PROBE_INTERVAL_MS', 10 * MINUTE)
    },
    /**
     * Where the last-good corpus is persisted, so a cold start (or an upstream
     * outage during boot) still serves data instead of an empty index.
     */
    snapshotPath: env('SNAPSHOT_PATH', './data/snapshot.json'),
    /**
     * Shared secret for POST /refresh. When unset the route is disabled rather
     * than left open — failing closed matters more than convenience here.
     */
    refreshToken: process.env.REFRESH_TOKEN ?? null,
    /**
     * Personal data is withheld by default. Player gender and FPA membership
     * numbers are only exposed if this is explicitly turned on, and should stay
     * off until the upstream owner confirms they are intended to be public.
     */
    exposePersonalFields: process.env.EXPOSE_PERSONAL_FIELDS === 'true',
    /**
     * Events still being judged are withheld from the index, because their
     * results are partial and change under us until the head judge locks the
     * last pool. Set this to true to consume them anyway.
     */
    consumeInProgressEvents: process.env.CONSUME_IN_PROGRESS_EVENTS === 'true',
    /** CORS allowlist. Empty means same-origin/server-to-server only. */
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
};
//# sourceMappingURL=config.js.map