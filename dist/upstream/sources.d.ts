import type { RawDirectoryResponse, RawEventDataVersion, RawEventsResponse, RawManifestResponse, RawPlayersResponse, RawPointsResponse, RawPointsSnapshotResponse, RawResultsResponse } from './types.js';
/**
 * One function per upstream endpoint. Nothing here interprets the data — that
 * is the normalizer's job. Keeping fetching dumb means the transport layer can
 * be swapped (for a DynamoDB reader, say) without touching domain logic.
 */
export declare const sources: {
    /** ~759 KB. */
    players: () => Promise<RawPlayersResponse>;
    /** ~228 KB. */
    events: () => Promise<RawEventsResponse>;
    /** ~3.8 MB, uncompressed. The expensive one — do not poll this. */
    results: () => Promise<RawResultsResponse>;
    /** ~16 KB. Cheap enough to use as a freshness probe for rankings. */
    manifest: () => Promise<RawManifestResponse>;
    /** ~682 KB. Current rankings/ratings for every series. */
    latestPoints: () => Promise<RawPointsResponse>;
    /**
     * ~96 KB. A single historical snapshot, by manifest key.
     * Note the response shape differs from `latestPoints` — see
     * `RawPointsSnapshotResponse`.
     */
    pointsSnapshot: (key: string) => Promise<RawPointsSnapshotResponse>;
    /** 135 bytes. Which event, if any, is being judged right now. */
    directory: () => Promise<RawDirectoryResponse>;
    /** 42 bytes. Version probe for a live event. */
    eventDataVersion: (eventKey: string) => Promise<RawEventDataVersion>;
};
