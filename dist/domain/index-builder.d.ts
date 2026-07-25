import type { RawDirectoryResponse, RawEventsResponse, RawManifestResponse, RawPlayersResponse, RawPointsResponse, RawPointsSnapshotResponse, RawResultsResponse } from '../upstream/types.js';
import { normalizeDivision } from './divisions.js';
import type { DivisionResult, Index, RankingSeries, RatingSeries } from './types.js';
/**
 * The raw corpus, exactly as fetched. This is what gets persisted to disk —
 * storing raw rather than derived data means we can change normalization logic
 * without a stale snapshot baking in the old behaviour.
 */
export interface Corpus {
    fetchedAt: number;
    players: RawPlayersResponse;
    events: RawEventsResponse;
    results: RawResultsResponse;
    manifest: RawManifestResponse;
    points: RawPointsResponse;
    directory: RawDirectoryResponse | null;
}
/**
 * Reshape a single-snapshot payload into the series-keyed form the index
 * builder expects.
 *
 * `downloadPointsData/{key}` returns a bare array for the one series its key
 * names, whereas `downloadLatestPointsData` returns an object keyed by series.
 * The series is recovered from the snapshot key ('ranking-open_2026-6-8' ->
 * 'ranking-open'), which also determines whether these are rankings or ratings.
 * The object form is still accepted in case upstream ever unifies them.
 */
export declare function snapshotToPoints(snapshotKey: string, payload: RawPointsSnapshotResponse): RawPointsResponse;
/**
 * Split the points payload into rankings and ratings.
 *
 * Both arrive under `data` keyed by series name, but they are different data:
 * `ranking-*` entries are cumulative tournament points with a per-result
 * breakdown, `rating-*` entries are an Elo-style strength estimate. We key off
 * the series prefix and validate the shape, so a series that does not look like
 * what its name claims is skipped rather than silently zeroed.
 */
export declare function buildPointsSeries(points: RawPointsResponse, results: Map<string, DivisionResult>): {
    rankings: Map<string, RankingSeries>;
    ratings: Map<string, RatingSeries>;
    warnings: string[];
};
/**
 * Build the complete read model from a raw corpus.
 *
 * Pure and synchronous: no I/O, no clock beyond `builtAt`. That makes the whole
 * normalization surface testable against recorded fixtures.
 */
export declare function buildIndex(corpus: Corpus): Index;
/** Division normalization is re-exported for consumers that need the same mapping. */
export { normalizeDivision };
