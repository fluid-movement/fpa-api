import { config } from '../config.js';
import { fetchJson } from './client.js';
import type {
	PointsManifestResponse,
	RawPointsSnapshotResponse,
	RawProfilesExport,
	SyncEventsResponse,
	SyncManifest,
	SyncPlayersResponse
} from './types.js';

/**
 * One function per upstream endpoint. Nothing here interprets the data — the
 * adapter reshapes it and the normalizers judge it. The contract for the sync
 * endpoints is docs/SYNC_API.md.
 */

/** The sync API accepts at most this many ids per `sync/events` call. */
export const SYNC_EVENTS_BATCH_SIZE = 50;

const api = () => `${config.upstreamBaseUrl}/api/v1`;

export const sources = {
	/** Every finished event's hash, plus one hash for the player list. Small; polled every sync. */
	syncManifest: () => fetchJson<SyncManifest>(`${api()}/sync/manifest`),

	/**
	 * Full finished events, 1 to `SYNC_EVENTS_BATCH_SIZE` ids per call. Ids that are unknown or
	 * no longer finished are left out of the answer, not reported as errors.
	 */
	syncEvents: async (ids: string[]) => {
		if (ids.length === 0 || ids.length > SYNC_EVENTS_BATCH_SIZE) {
			throw new RangeError(`sync/events takes 1 to ${SYNC_EVENTS_BATCH_SIZE} ids, got ${ids.length}`);
		}
		const query = ids.map(encodeURIComponent).join(',');
		return fetchJson<SyncEventsResponse>(`${api()}/sync/events?ids=${query}`);
	},

	/** Every player, hidden ones included. Fetched only when the manifest's players hash moves. */
	syncPlayers: () => fetchJson<SyncPlayersResponse>(`${api()}/sync/players`),

	/** Every published ranking/rating snapshot. Small; polled every sync. */
	pointsManifest: () => fetchJson<PointsManifestResponse>(`${api()}/points/getManifest`),

	/**
	 * One snapshot, by manifest key: a bare array for the one series the key
	 * names. Used for each series' latest snapshot during a sync, and on demand
	 * by `GET /snapshots/{key}`.
	 */
	pointsSnapshot: (key: string) =>
		fetchJson<RawPointsSnapshotResponse>(
			`${api()}/points/downloadPointsData/${encodeURIComponent(key)}`
		),

	/**
	 * Player profile enrichment from fpa-profiles. Only called when
	 * `PROFILES_URL` is set; see `config.profilesUrl`.
	 */
	profiles: () => fetchJson<RawProfilesExport>(`${config.profilesUrl}/export`)
};
