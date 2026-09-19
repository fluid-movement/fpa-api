import { config } from '../config.js';
import type {
	RawDirectoryResponse,
	RawEventDataResponse,
	RawEventsResponse,
	RawManifestResponse,
	RawPlayersResponse,
	RawPointsResponse,
	RawPointsSnapshotResponse,
	RawRankingEntry,
	RawRatingEntry,
	RawResultsResponse
} from '../upstream/types.js';
import { normalizeDivision, parseSeriesKey } from './divisions.js';
import { buildPlayers } from './players.js';
import { normalizeResult } from './results.js';
import type {
	DivisionResult,
	EventSummary,
	Index,
	PlayerPlacement,
	RankingEntry,
	RankingSeries,
	RatingEntry,
	RatingSeries,
	SnapshotRef
} from './types.js';

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
	/**
	 * Per-event pool lock state, for the events the judging service is
	 * currently showing. An absent entry means "never observed" — either we
	 * have not fetched it yet or the judging service was unreachable — which is
	 * treated differently from an observed unlocked pool. See `findInProgress`.
	 */
	liveLocks?: Record<string, EventLockState>;
}

export interface EventLockState {
	/** False while any pool is still unlocked, i.e. the event is being judged. */
	allPoolsLocked: boolean;
	poolCount: number;
	unlockedCount: number;
	observedAt: number;
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
export function snapshotToPoints(
	snapshotKey: string,
	payload: RawPointsSnapshotResponse
): RawPointsResponse {
	const data = payload.data;
	if (!data) return {};
	if (!Array.isArray(data)) return { data };

	const seriesKey = snapshotKey.split('_')[0] ?? snapshotKey;
	return { data: { [seriesKey]: data } };
}

/** Upstream dates are 'YYYY-M-D' in the manifest; pad to a sortable ISO date. */
function padDate(date: string | undefined): string | null {
	if (!date) return null;
	const parts = date.split('-');
	if (parts.length !== 3) return date;
	const [y, m, d] = parts;
	return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

function buildSnapshots(manifest: RawManifestResponse): SnapshotRef[] {
	return Object.values(manifest.manifest ?? {})
		.filter((entry) => entry.key && entry.isHidden !== true)
		.map((entry) => {
			const { type, division } = parseSeriesKey(entry.key!.split('_')[0] ?? '');
			return {
				key: entry.key!,
				type,
				division: entry.divisionName ?? division,
				date: padDate(entry.date),
				createdAt: entry.createdAt ?? null
			};
		})
		.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * Split the points payload into rankings and ratings.
 *
 * Both arrive under `data` keyed by series name, but they are different data:
 * `ranking-*` entries are cumulative tournament points with a per-result
 * breakdown, `rating-*` entries are an Elo-style strength estimate. We key off
 * the series prefix and validate the shape, so a series that does not look like
 * what its name claims is skipped rather than silently zeroed.
 */
export function buildPointsSeries(
	points: RawPointsResponse,
	results: Map<string, DivisionResult>
): {
	rankings: Map<string, RankingSeries>;
	ratings: Map<string, RatingSeries>;
	warnings: string[];
} {
	const rankings = new Map<string, RankingSeries>();
	const ratings = new Map<string, RatingSeries>();
	const warnings: string[] = [];

	for (const [seriesKey, rawEntries] of Object.entries(points.data ?? {})) {
		if (!Array.isArray(rawEntries)) continue;
		const { type, division } = parseSeriesKey(seriesKey);

		if (type === 'rating') {
			const entries: RatingEntry[] = rawEntries
				.map((entry) => entry as RawRatingEntry)
				.filter((entry) => entry.id && typeof entry.rating === 'number')
				// Upstream stores ratings pre-sorted, but do not depend on it.
				.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
				.map((entry, position) => ({
					// Ratings carry no explicit rank; it is positional.
					rank: position + 1,
					playerId: entry.id!,
					fullName: entry.fullName?.trim() || 'Unknown Player',
					rating: entry.rating!,
					matchCount: entry.matchCount ?? 0,
					peakRating: entry.highestRating ?? null,
					peakRatingDate: padDate(entry.highestRatingDate),
					peakRank: entry.highestRank ?? null,
					peakRankDate: padDate(entry.highestRankDate)
				}));

			if (entries.length !== rawEntries.length) {
				warnings.push(
					`Rating series "${seriesKey}": ${rawEntries.length - entries.length} entr(ies) skipped for missing id or rating`
				);
			}

			ratings.set(seriesKey, { series: seriesKey, type: 'rating', division, entries });
			continue;
		}

		const entries: RankingEntry[] = rawEntries
			.map((entry) => entry as RawRankingEntry)
			.filter((entry) => entry.id)
			.map((entry) => ({
				rank: entry.rank ?? 0,
				playerId: entry.id!,
				fullName: entry.fullName?.trim() || 'Unknown Player',
				points: entry.points ?? 0,
				resultsCount: entry.resultsCount ?? 0,
				// This join is the point of the whole service: it turns "1632
				// points" into "which events earned them".
				breakdown: (entry.pointsList ?? [])
					.filter((p) => p.resultsId)
					.map((p) => {
						const result = results.get(p.resultsId!);
						return {
							resultId: p.resultsId!,
							points: p.points ?? 0,
							eventId: result?.eventId ?? null,
							eventName: result?.eventName ?? null,
							division: result?.division ?? null
						};
					})
					.sort((a, b) => b.points - a.points)
			}))
			.sort((a, b) => a.rank - b.rank);

		rankings.set(seriesKey, { series: seriesKey, type: 'ranking', division, entries });
	}

	return { rankings, ratings, warnings };
}

/** Flatten results into a per-player placement list for profiles and dashboards. */
function buildPlacements(
	results: Map<string, DivisionResult>,
	events: Map<string, EventSummary>
): Map<string, PlayerPlacement[]> {
	const byPlayer = new Map<string, PlayerPlacement[]>();

	for (const result of results.values()) {
		const eventDate = events.get(result.eventId)?.startDate ?? null;

		for (const round of result.rounds) {
			for (const pool of round.pools) {
				for (const team of pool.teams) {
					for (const member of team.players) {
						const placement: PlayerPlacement = {
							resultId: result.id,
							eventId: result.eventId,
							eventName: result.eventName,
							eventDate,
							division: result.division,
							round: round.number,
							roundName: round.name,
							pool: pool.name,
							place: team.place,
							points: team.points,
							teammates: team.players.filter((p) => p.id !== member.id)
						};

						const list = byPlayer.get(member.id);
						if (list) list.push(placement);
						else byPlayer.set(member.id, [placement]);
					}
				}
			}
		}
	}

	// Most recent first — that is how every consumer wants to render it.
	for (const list of byPlayer.values()) {
		list.sort((a, b) => (b.eventDate ?? '').localeCompare(a.eventDate ?? ''));
	}

	return byPlayer;
}

/**
 * Reduce a judging event's pool map to the one fact we care about: is every
 * pool locked? The head judge locks a pool when its scoring is final, so an
 * event with no unlocked pools left has finished.
 *
 * A pool map with no pools at all counts as unlocked. An event that has been
 * created in the judging app but has no pools yet has certainly not finished.
 */
export function summarizePoolLocks(payload: RawEventDataResponse): EventLockState {
	const pools = Object.values(payload.eventData?.eventData?.poolMap ?? {});
	const unlockedCount = pools.filter((pool) => pool.isLocked !== true).length;
	return {
		allPoolsLocked: pools.length > 0 && unlockedCount === 0,
		poolCount: pools.length,
		unlockedCount,
		observedAt: Date.now()
	};
}

/**
 * Which events are still being judged, and must therefore be withheld.
 *
 * Only events the judging directory is showing are candidates — everything
 * else is history. For those, the per-pool `isLocked` flags decide. Directory
 * presence alone is not enough: upstream's `showInDirectory` is cleared by a
 * manual admin call and routinely stays true for weeks after an event ends.
 *
 * When lock state was never observed we fall back to the calendar, and only
 * withhold an event that could still plausibly be running. Withholding on
 * unknown state alone would mean a judging-service outage silently drops a
 * finished event's complete results.
 */
function findInProgress(corpus: Corpus, warnings: string[]): Set<string> {
	const inProgress = new Set<string>();
	if (config.consumeInProgressEvents) return inProgress;

	const today = new Date().toISOString().slice(0, 10);

	for (const entry of corpus.directory?.eventDirectory ?? []) {
		const eventId = entry.eventKey;
		if (!eventId) continue;

		const name = entry.eventName?.trim() || 'Unnamed Event';
		const lock = corpus.liveLocks?.[eventId];

		if (lock) {
			if (lock.allPoolsLocked) continue;
			inProgress.add(eventId);
			warnings.push(
				`Event ${eventId} ("${name}") is being judged — ` +
					`${lock.unlockedCount} of ${lock.poolCount} pool(s) unlocked; withheld from the index`
			);
			continue;
		}

		const endDate = corpus.events.allEventSummaryData?.[eventId]?.endDate ?? null;
		if (endDate !== null && endDate < today) continue;

		inProgress.add(eventId);
		warnings.push(
			`Event ${eventId} ("${name}") is in the judging directory with no observed pool ` +
				`lock state and has not ended (endDate ${endDate ?? 'unknown'}); withheld from the index`
		);
	}

	return inProgress;
}

/**
 * Build the complete read model from a raw corpus.
 *
 * Pure and synchronous: no I/O, no clock beyond `builtAt`. That makes the whole
 * normalization surface testable against recorded fixtures.
 */
export function buildIndex(corpus: Corpus): Index {
	const warnings: string[] = [];

	const { players, canonicalPlayerId, warnings: playerWarnings } = buildPlayers(
		corpus.players.players ?? {}
	);
	warnings.push(...playerWarnings);

	// Events still being judged are withheld whole — their results are partial
	// and keep changing until the last pool is locked. Resolved before anything
	// is normalized so the excluded ids can be filtered out at the source.
	const inProgress = findInProgress(corpus, warnings);

	// Results first: events need result counts, rankings need result lookups.
	const results = new Map<string, DivisionResult>();
	for (const [id, raw] of Object.entries(corpus.results.results ?? {})) {
		if (raw.eventId && inProgress.has(raw.eventId)) continue;
		const normalized = normalizeResult(id, raw, players, canonicalPlayerId);
		if (normalized) results.set(id, normalized);
	}

	const resultsByEvent = new Map<string, DivisionResult[]>();
	for (const result of results.values()) {
		const list = resultsByEvent.get(result.eventId);
		if (list) list.push(result);
		else resultsByEvent.set(result.eventId, [result]);
	}

	const events = new Map<string, EventSummary>();
	for (const [id, raw] of Object.entries(corpus.events.allEventSummaryData ?? {})) {
		if (inProgress.has(id)) continue;
		const eventResults = resultsByEvent.get(id) ?? [];
		events.set(id, {
			id,
			name: raw.eventName?.trim() || 'Unnamed Event',
			startDate: raw.startDate ?? null,
			endDate: raw.endDate ?? null,
			createdAt: raw.createdAt ?? null,
			fpaWebsiteId: raw.additionalData?.fpaId ?? null,
			fpaWebsiteSlug: raw.additionalData?.postName ?? null,
			divisions: [...new Set(eventResults.map((r) => r.division))].sort(),
			resultCount: eventResults.length
		});
	}

	// Results can reference events the summary service does not have (2 in prod).
	// Synthesize a stub rather than dropping the results on the floor.
	for (const [eventId, eventResults] of resultsByEvent) {
		if (events.has(eventId)) continue;
		warnings.push(
			`Results reference event ${eventId} ("${eventResults[0]!.eventName}") which is missing from the event directory`
		);
		events.set(eventId, {
			id: eventId,
			name: eventResults[0]!.eventName,
			startDate: null,
			endDate: null,
			createdAt: eventResults[0]!.createdAt,
			fpaWebsiteId: null,
			fpaWebsiteSlug: null,
			divisions: [...new Set(eventResults.map((r) => r.division))].sort(),
			resultCount: eventResults.length
		});
	}

	const unknownPlayerIds = new Set<string>();
	for (const result of results.values()) {
		for (const round of result.rounds) {
			for (const pool of round.pools) {
				for (const team of pool.teams) {
					for (const member of team.players) {
						if (member.unknown) unknownPlayerIds.add(member.id);
					}
				}
			}
		}
	}
	if (unknownPlayerIds.size > 0) {
		warnings.push(
			`${unknownPlayerIds.size} player id(s) appear in results but are missing from the player directory`
		);
	}

	const liveEntry = corpus.directory?.eventDirectory?.[0];

	const pointsSeries = buildPointsSeries(corpus.points, results);
	warnings.push(...pointsSeries.warnings);

	return {
		builtAt: Date.now(),
		players,
		canonicalPlayerId,
		events,
		results,
		resultsByEvent,
		placementsByPlayer: buildPlacements(results, events),
		rankings: pointsSeries.rankings,
		ratings: pointsSeries.ratings,
		snapshots: buildSnapshots(corpus.manifest),
		live: liveEntry?.eventKey
			? {
					eventId: liveEntry.eventKey,
					eventName: liveEntry.eventName?.trim() || 'Unnamed Event',
					modifiedAt: liveEntry.modifiedAt ?? null
				}
			: null,
		warnings
	};
}

/** Division normalization is re-exported for consumers that need the same mapping. */
export { normalizeDivision };
