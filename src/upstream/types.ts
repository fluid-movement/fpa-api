/**
 * Shapes as they come off the wire from the upstream microservices.
 *
 * These are documented from observed production payloads, not from a contract —
 * upstream publishes no schema. Everything is therefore optional/defensive:
 * treat these as "what we hope to find", and let the normalizer decide what to
 * do when a field is missing. Never widen these into guarantees.
 */

export interface RawPlayer {
	key?: string;
	firstName?: string;
	lastName?: string;
	country?: string;
	/** 'M' | 'F' | 'X' in practice, but not enforced upstream. */
	gender?: string;
	membership?: number;
	fpaWebsiteId?: string;
	/** Points at the canonical player this entry duplicates. May chain, or dangle. */
	aliasKey?: string;
	createdAt?: number;
	lastActive?: number;
}

export interface RawPlayersResponse {
	players?: Record<string, RawPlayer>;
}

export interface RawEvent {
	key?: string;
	eventName?: string;
	/** 'YYYY-MM-DD'. */
	startDate?: string;
	endDate?: string;
	createdAt?: number;
	additionalData?: {
		/** Id of the corresponding post on the legacy FPA website. */
		fpaId?: string;
		postName?: string;
	};
}

export interface RawEventsResponse {
	allEventSummaryData?: Record<string, RawEvent>;
}

export interface RawTeam {
	players?: string[];
	place?: number;
	points?: number;
}

export interface RawPool {
	poolId?: string;
	teamData?: RawTeam[];
}

/**
 * A round is `{ id, poolA, poolB, ... }`. Pool keys are usually `poolA` but
 * lowercase `poola` occurs in production data, so match case-insensitively.
 */
export interface RawRound {
	id?: number;
	[poolKey: string]: unknown;
}

/**
 * `{ divisionName, eventId, round1, round2, ..., isHidden? }`.
 * Round keys are `round1`..`round7` in current data, and are NOT a contiguous
 * range — an event may have round1, round3 and round5 with no round2 or round4.
 */
export interface RawResultsData {
	divisionName?: string;
	eventId?: string;
	isHidden?: boolean;
	[roundKey: string]: unknown;
}

export interface RawResult {
	key?: string;
	eventId?: string;
	eventName?: string;
	divisionName?: string;
	createdAt?: number;
	/** The original text the results were entered as. Kept upstream as an audit trail. */
	rawText?: string;
	resultsData?: RawResultsData;
}

export interface RawResultsResponse {
	results?: Record<string, RawResult>;
}

export interface RawManifestEntry {
	key?: string;
	/** 'YYYY-M-D' — note: NOT zero-padded. */
	date?: string;
	divisionName?: string;
	dataPath?: string;
	createdAt?: number;
	isHidden?: boolean;
}

export interface RawManifestResponse {
	manifest?: Record<string, RawManifestEntry>;
}

/**
 * Ranking and rating entries share an envelope but NOT a schema — despite both
 * living under `data` keyed by series name.
 *
 *   ranking-* : { id, fullName, rank, points, resultsCount, pointsList }
 *   rating-*  : { id, fullName, rating, matchCount, highestRating,
 *                 highestRatingDate, highestRank, highestRankDate }
 *
 * Rankings are cumulative tournament points; ratings are an Elo-style strength
 * estimate. Treating them as one type silently produces zeroed-out ratings, so
 * they are modelled separately all the way through.
 */
export interface RawRankingEntry {
	/** The player's canonical GUID. */
	id?: string;
	fullName?: string;
	rank?: number;
	points?: number;
	resultsCount?: number;
	/** Each entry ties points earned back to a specific result record. */
	pointsList?: Array<{ resultsId?: string; points?: number }>;
}

export interface RawRatingEntry {
	id?: string;
	fullName?: string;
	rating?: number;
	/** Number of head-to-head comparisons behind this rating. */
	matchCount?: number;
	highestRating?: number;
	/** 'YYYY-M-D', not zero-padded. */
	highestRatingDate?: string;
	highestRank?: number;
	highestRankDate?: string;
}

export type RawPointsEntry = RawRankingEntry | RawRatingEntry;

/**
 * `downloadLatestPointsData` — `data` keyed by series name, e.g.
 * 'ranking-open' | 'ranking-women' | 'rating-open'.
 */
export interface RawPointsResponse {
	data?: Record<string, RawPointsEntry[]>;
}

/**
 * `downloadPointsData/{key}` — a DIFFERENT shape from the latest-points
 * endpoint despite the shared `data` envelope: a bare array of entries for the
 * one series the key names, with no series keying. The series has to be
 * recovered from the snapshot key itself.
 */
export interface RawPointsSnapshotResponse {
	data?: RawPointsEntry[] | Record<string, RawPointsEntry[]>;
}

export interface RawDirectoryEntry {
	eventKey?: string;
	eventName?: string;
	modifiedAt?: number;
}

export interface RawDirectoryResponse {
	eventDirectory?: RawDirectoryEntry[];
}

export interface RawEventDataVersion {
	importantVersion?: number;
	minorVersion?: number;
}
