/**
 * The normalized domain model this API serves.
 *
 * Unlike the upstream shapes in `upstream/types.ts`, these ARE guarantees:
 * required fields are always present, names are canonical, and cross-references
 * have been resolved. Anything upstream could not supply becomes `null`, never
 * `undefined` and never a silently-dropped record.
 */

export interface Player {
	id: string;
	firstName: string;
	lastName: string;
	fullName: string;
	country: string | null;
	/** Withheld unless EXPOSE_PERSONAL_FIELDS is enabled. */
	gender: string | null;
	/** Withheld unless EXPOSE_PERSONAL_FIELDS is enabled. */
	membership: number | null;
	fpaWebsiteId: string | null;
	/** Other upstream GUIDs that resolve to this player. */
	aliasIds: string[];
	createdAt: number | null;
	lastActive: number | null;
}

export interface EventSummary {
	id: string;
	name: string;
	/** 'YYYY-MM-DD', or null when upstream has no date. */
	startDate: string | null;
	endDate: string | null;
	createdAt: number | null;
	fpaWebsiteId: string | null;
	fpaWebsiteSlug: string | null;
	/** Normalized division names that have results for this event. */
	divisions: string[];
	resultCount: number;
}

export interface TeamMember {
	id: string;
	fullName: string;
	/** True when the player GUID in the results is not in the player directory. */
	unknown: boolean;
}

export interface Team {
	place: number | null;
	points: number | null;
	players: TeamMember[];
}

export interface Pool {
	name: string;
	teams: Team[];
}

export interface Round {
	number: number;
	/** Best-effort label: round 1 is the final, counting backwards. */
	name: string;
	pools: Pool[];
}

export interface DivisionResult {
	id: string;
	eventId: string;
	eventName: string;
	/** Canonical division name. */
	division: string;
	/** Exactly what upstream stored, kept so dirty data stays traceable. */
	divisionRaw: string;
	createdAt: number | null;
	rounds: Round[];
}

export interface RankingBreakdownEntry {
	resultId: string;
	points: number;
	/** Null when the referenced result is no longer in the results corpus. */
	eventId: string | null;
	eventName: string | null;
	division: string | null;
}

export interface RankingEntry {
	rank: number;
	playerId: string;
	fullName: string;
	points: number;
	resultsCount: number;
	/** Which events produced these points. This is the join upstream cannot do. */
	breakdown: RankingBreakdownEntry[];
}

export interface RankingSeries {
	/** e.g. 'ranking-open'. */
	series: string;
	type: 'ranking';
	division: string;
	entries: RankingEntry[];
}

/**
 * Ratings are an Elo-style strength estimate, not accumulated tournament
 * points. Different inputs, different meaning, different shape — kept separate
 * from rankings throughout rather than forced into a shared type.
 */
export interface RatingEntry {
	/** Derived from position in the series: upstream stores ratings pre-sorted. */
	rank: number;
	playerId: string;
	fullName: string;
	rating: number;
	/** Head-to-head comparisons behind this rating. Low counts are unreliable. */
	matchCount: number;
	peakRating: number | null;
	peakRatingDate: string | null;
	peakRank: number | null;
	peakRankDate: string | null;
}

export interface RatingSeries {
	series: string;
	type: 'rating';
	division: string;
	entries: RatingEntry[];
}

export interface SnapshotRef {
	key: string;
	type: 'ranking' | 'rating';
	division: string;
	/** Normalized to 'YYYY-MM-DD' (upstream is not zero-padded). */
	date: string | null;
	createdAt: number | null;
}

/** One placement by one player, flattened for profile/timeline rendering. */
export interface PlayerPlacement {
	resultId: string;
	eventId: string;
	eventName: string;
	eventDate: string | null;
	division: string;
	round: number;
	roundName: string;
	pool: string;
	place: number | null;
	points: number | null;
	teammates: TeamMember[];
}

export interface PlayerStats {
	eventCount: number;
	placementCount: number;
	/** First places, counted across all rounds and pools. */
	wins: number;
	podiums: number;
	firstEventDate: string | null;
	lastEventDate: string | null;
	divisions: string[];
}

export interface PlayerRanking {
	series: string;
	division: string;
	rank: number;
	points: number;
	resultsCount: number;
}

export interface PlayerRating {
	series: string;
	division: string;
	rank: number;
	rating: number;
	matchCount: number;
	peakRating: number | null;
	peakRatingDate: string | null;
}

export interface PlayerProfile {
	player: Player;
	stats: PlayerStats;
	rankings: PlayerRanking[];
	ratings: PlayerRating[];
	placements: PlayerPlacement[];
}

export interface LiveEvent {
	eventId: string;
	eventName: string;
	modifiedAt: number | null;
}

/**
 * The immutable, fully-derived read model. Built once per refresh and swapped
 * in atomically — no request ever observes a half-updated index.
 */
export interface Index {
	builtAt: number;
	players: Map<string, Player>;
	/** Every upstream player GUID (including aliases) -> canonical player id. */
	canonicalPlayerId: Map<string, string>;
	events: Map<string, EventSummary>;
	results: Map<string, DivisionResult>;
	resultsByEvent: Map<string, DivisionResult[]>;
	placementsByPlayer: Map<string, PlayerPlacement[]>;
	rankings: Map<string, RankingSeries>;
	ratings: Map<string, RatingSeries>;
	snapshots: SnapshotRef[];
	live: LiveEvent | null;
	/** Non-fatal problems found while normalizing. Surfaced on /health. */
	warnings: string[];
}
