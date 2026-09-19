/**
 * Runtime configuration.
 *
 * Every upstream base URL is an env var on purpose. They are AWS API Gateway
 * IDs owned by a third party; if those services are ever redeployed the IDs
 * change, and we need to be able to repoint without a code change.
 */
export declare const config: {
    readonly port: number;
    /** Upstream service base URLs (no trailing slash). */
    readonly upstream: {
        readonly players: string;
        readonly events: string;
        readonly results: string;
        readonly points: string;
        readonly judging: string;
    };
    /** How long a single upstream request may take before we give up on it. */
    readonly requestTimeoutMs: number;
    /**
     * Tiered refresh. Upstream exposes no ETag/Last-Modified, so we cannot make
     * conditional requests. Instead we poll two tiny endpoints often and pull the
     * ~5 MB corpus rarely — triggered by those probes, with a slow safety net.
     */
    readonly refresh: {
        /** Full corpus refetch floor, even if no probe fires. */
        readonly fullIntervalMs: number;
        /** `getEventDirectory` — 135 bytes. Detects a live event starting/ending. */
        readonly directoryProbeIntervalMs: number;
        /** `getManifest` — 16 KB. Detects a newly published ranking snapshot. */
        readonly manifestProbeIntervalMs: number;
    };
    /**
     * Where the last-good corpus is persisted, so a cold start (or an upstream
     * outage during boot) still serves data instead of an empty index.
     */
    readonly snapshotPath: string;
    /**
     * Shared secret for POST /refresh. When unset the route is disabled rather
     * than left open — failing closed matters more than convenience here.
     */
    readonly refreshToken: string | null;
    /**
     * Personal data is withheld by default. Player gender and FPA membership
     * numbers are only exposed if this is explicitly turned on, and should stay
     * off until the upstream owner confirms they are intended to be public.
     */
    readonly exposePersonalFields: boolean;
    /**
     * Events still being judged are withheld from the index, because their
     * results are partial and change under us until the head judge locks the
     * last pool. Set this to true to consume them anyway.
     */
    readonly consumeInProgressEvents: boolean;
    /** CORS allowlist. Empty means same-origin/server-to-server only. */
    readonly corsOrigins: string[];
};
export type Config = typeof config;
