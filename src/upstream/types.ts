/**
 * Two families of shapes live here.
 *
 * `Sync*` and `Points*` are what comes off the wire from FullstackFreestyleTools: the sync API
 * and the Points API, documented in docs/SYNC_API.md. They follow a contract, but stay
 * optional/defensive at this boundary all the same.
 *
 * `Raw*` are the corpus types the domain normalizers read. They were the old AWS services' wire
 * shapes; `adapter.ts` now produces them from the sync payloads, so the normalizers did not have
 * to change. Treat them as "what we hope to find" and let the normalizer decide what to do when a
 * field is missing.
 */

// ── Sync API (`/api/v1/sync/*`) ─────────────────────────────────────────────

/** `GET /api/v1/sync/manifest`. */
export interface SyncManifest {
	formatVersion?: number;
	generatedAt?: string;
	players?: { hash?: string; count?: number };
	/** Event id -> opaque hash of that event's payload. Finished events only. */
	events?: Record<string, string>;
}

export interface SyncTeam {
	place?: number | null;
	points?: number | null;
	/** Raw player ids, possibly aliases; resolved through `SyncPlayer.aliasId`. */
	playerIds?: string[];
}

export interface SyncPool {
	/** Upper-case pool letter. */
	pool?: string;
	teams?: SyncTeam[];
}

export interface SyncRound {
	/** 1 = Finals, 2 = Semifinals, … Not necessarily contiguous. */
	number?: number;
	pools?: SyncPool[];
}

export interface SyncDivision {
	/** The same id rankings use as `resultsId`. */
	id?: string;
	name?: string;
	rounds?: SyncRound[];
}

export interface SyncEvent {
	id?: string;
	name?: string;
	startDate?: string | null;
	endDate?: string | null;
	fpaId?: string | number | null;
	postName?: string | null;
	divisions?: SyncDivision[];
}

/** `GET /api/v1/sync/events?ids=…`. */
export interface SyncEventsResponse {
	events?: SyncEvent[];
}

export interface SyncPlayer {
	id?: string;
	firstName?: string | null;
	lastName?: string | null;
	country?: string | null;
	fpaWebsiteId?: string | number | null;
	/** The entry this player duplicates. May chain, or dangle. */
	aliasId?: string | null;
	/** Hidden players are sent so line-ups stay whole; fpa-api decides what to show. */
	hidden?: boolean;
}

/** `GET /api/v1/sync/players`. */
export interface SyncPlayersResponse {
	players?: SyncPlayer[];
}

// ── Points API (`/api/v1/points/*`) ─────────────────────────────────────────

/**
 * One `getManifest` entry. Like `RawManifestEntry`, except `createdAt` is not pinned down by the
 * contract: accept epoch milliseconds or an ISO string, and let the adapter normalize it.
 */
export interface PointsManifestEntry extends Omit<RawManifestEntry, 'createdAt'> {
	createdAt?: number | string;
}

/** `GET /api/v1/points/getManifest`. */
export interface PointsManifestResponse {
	manifest?: Record<string, PointsManifestEntry>;
}

// ── Corpus types read by the domain normalizers ─────────────────────────────

/**
 * fpa-profiles' `GET /export`. Ours rather than upstream's, but just as
 * untrusted at this boundary: every field is optional until the domain layer
 * has checked it.
 */
export interface RawProfilesExport {
	version?: number;
	generatedAt?: string;
	profiles?: RawExportedProfile[];
}

export interface RawExportedProfile {
	playerId?: string;
	updatedAt?: string;
	fields?: Record<string, unknown>;
}

export interface RawPlayer {
	key?: string;
	firstName?: string;
	lastName?: string;
	country?: string;
	fpaWebsiteId?: string;
	/** Points at the canonical player this entry duplicates. May chain, or dangle. */
	aliasKey?: string;
	/** Left out of player lists, search and matching; still named in results. */
	hidden?: boolean;
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
 * Current rankings and ratings, `data` keyed by series name, e.g.
 * 'ranking-open' | 'ranking-women' | 'rating-open'. Assembled by the adapter from each series'
 * latest snapshot (the shape of the old `downloadLatestPointsData`).
 */
export interface RawPointsResponse {
	data?: Record<string, RawPointsEntry[]>;
}

/**
 * `downloadPointsData/{key}` — a DIFFERENT shape from `RawPointsResponse`
 * despite the shared `data` envelope: a bare array of entries for the one
 * series the key names, with no series keying. The series has to be recovered
 * from the snapshot key itself.
 */
export interface RawPointsSnapshotResponse {
	data?: RawPointsEntry[] | Record<string, RawPointsEntry[]>;
}
