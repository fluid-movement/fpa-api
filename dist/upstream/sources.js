import { config } from '../config.js';
import { fetchJson } from './client.js';
/**
 * One function per upstream endpoint. Nothing here interprets the data — that
 * is the normalizer's job. Keeping fetching dumb means the transport layer can
 * be swapped (for a DynamoDB reader, say) without touching domain logic.
 */
export const sources = {
    /** ~759 KB. */
    players: () => fetchJson(`${config.upstream.players}/getAllPlayers`),
    /** ~228 KB. */
    events: () => fetchJson(`${config.upstream.events}/getAllEvents`),
    /** ~3.8 MB, uncompressed. The expensive one — do not poll this. */
    results: () => fetchJson(`${config.upstream.results}/getAllResults`),
    /** ~16 KB. Cheap enough to use as a freshness probe for rankings. */
    manifest: () => fetchJson(`${config.upstream.points}/getManifest`),
    /** ~682 KB. Current rankings/ratings for every series. */
    latestPoints: () => fetchJson(`${config.upstream.points}/downloadLatestPointsData`),
    /**
     * ~96 KB. A single historical snapshot, by manifest key.
     * Note the response shape differs from `latestPoints` — see
     * `RawPointsSnapshotResponse`.
     */
    pointsSnapshot: (key) => fetchJson(`${config.upstream.points}/downloadPointsData/${encodeURIComponent(key)}`),
    /** 135 bytes. Which event, if any, is being judged right now. */
    directory: () => fetchJson(`${config.upstream.judging}/getEventDirectory`),
    /** 42 bytes. Version probe for a live event. */
    eventDataVersion: (eventKey) => fetchJson(`${config.upstream.judging}/getEventDataVersion/${encodeURIComponent(eventKey)}`)
};
//# sourceMappingURL=sources.js.map