import { config } from '../config.js';
import { fetchJson } from './client.js';
import type {
	RawDirectoryResponse,
	RawEventDataVersion,
	RawEventsResponse,
	RawManifestResponse,
	RawPlayersResponse,
	RawPointsResponse,
	RawPointsSnapshotResponse,
	RawResultsResponse
} from './types.js';

/**
 * One function per upstream endpoint. Nothing here interprets the data — that
 * is the normalizer's job. Keeping fetching dumb means the transport layer can
 * be swapped (for a DynamoDB reader, say) without touching domain logic.
 */

export const sources = {
	/** ~759 KB. */
	players: () =>
		fetchJson<RawPlayersResponse>(`${config.upstream.players}/getAllPlayers`),

	/** ~228 KB. */
	events: () =>
		fetchJson<RawEventsResponse>(`${config.upstream.events}/getAllEvents`),

	/** ~3.8 MB, uncompressed. The expensive one — do not poll this. */
	results: () =>
		fetchJson<RawResultsResponse>(`${config.upstream.results}/getAllResults`),

	/** ~16 KB. Cheap enough to use as a freshness probe for rankings. */
	manifest: () =>
		fetchJson<RawManifestResponse>(`${config.upstream.points}/getManifest`),

	/** ~682 KB. Current rankings/ratings for every series. */
	latestPoints: () =>
		fetchJson<RawPointsResponse>(`${config.upstream.points}/downloadLatestPointsData`),

	/**
	 * ~96 KB. A single historical snapshot, by manifest key.
	 * Note the response shape differs from `latestPoints` — see
	 * `RawPointsSnapshotResponse`.
	 */
	pointsSnapshot: (key: string) =>
		fetchJson<RawPointsSnapshotResponse>(
			`${config.upstream.points}/downloadPointsData/${encodeURIComponent(key)}`
		),

	/** 135 bytes. Which event, if any, is being judged right now. */
	directory: () =>
		fetchJson<RawDirectoryResponse>(`${config.upstream.judging}/getEventDirectory`),

	/** 42 bytes. Version probe for a live event. */
	eventDataVersion: (eventKey: string) =>
		fetchJson<RawEventDataVersion>(
			`${config.upstream.judging}/getEventDataVersion/${encodeURIComponent(eventKey)}`
		)
};
