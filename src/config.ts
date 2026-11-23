/**
 * Runtime configuration.
 *
 * The upstream base URL is an env var so a local or staging FullstackFreestyleTools can stand in
 * for production without a code change.
 */

function env(name: string, fallback: string): string {
	const value = process.env[name];
	return value && value.length > 0 ? value : fallback;
}

function intEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
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

	/**
	 * Base URL of FullstackFreestyleTools (no trailing slash): the sync API
	 * (`/api/v1/sync/*`) and the Points API (`/api/v1/points/*`). See docs/SYNC_API.md.
	 */
	upstreamBaseUrl: env('UPSTREAM_BASE_URL', 'https://freestylejudge.com').replace(/\/+$/, ''),

	/**
	 * Base URL of fpa-profiles, whose `GET /export` supplies player profile
	 * enrichment. Unset disables the profiles source; it is optional data.
	 */
	profilesUrl: process.env.PROFILES_URL?.trim().replace(/\/+$/, '') || null,

	/** How long a single upstream request may take before we give up on it. */
	requestTimeoutMs: intEnv('REQUEST_TIMEOUT_MS', 30 * SECOND),

	/**
	 * How often to sync. A sync costs two small manifest calls when nothing changed, and fetches
	 * only what the manifests say is new or changed. `POST /refresh` forces one on demand.
	 */
	syncIntervalMs: intEnv('SYNC_INTERVAL_MS', 60 * MINUTE),

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

	/** CORS allowlist. Empty means same-origin/server-to-server only. */
	corsOrigins: (process.env.CORS_ORIGINS ?? '')
		.split(',')
		.map((o) => o.trim())
		.filter(Boolean)
} as const;

export type Config = typeof config;
