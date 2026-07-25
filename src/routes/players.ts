import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Index, PlayerRanking, PlayerRating, PlayerStats } from '../domain/types.js';
import { commonErrors, notFound, notFoundResponse, paginate } from '../lib/http.js';
import { paginated, PlayerProfileSchema, PlayerSchema } from '../schemas/domain.js';
import { PlayerIdParam, PlayerListQuery } from '../schemas/params.js';
import { store } from '../store/store.js';

export const players = new OpenAPIHono();

const listRoute = createRoute({
	method: 'get',
	path: '/',
	tags: ['Players'],
	summary: 'List players',
	description:
		'Only canonical players are listed. Upstream stores duplicate entries for the same person ' +
		'linked by `aliasKey`; those are merged here and their GUIDs appear in `aliasIds`.',
	request: { query: PlayerListQuery },
	responses: {
		200: {
			description: 'A page of players',
			content: {
				'application/json': { schema: paginated(PlayerSchema, 'PaginatedPlayers') }
			}
		},
		...commonErrors
	}
});

players.openapi(listRoute, (c) => {
	const index = store.requireIndex();
	const { q, country, hasResults, limit, offset } = c.req.valid('query');

	let items = [...index.players.values()];

	if (q) {
		const needle = q.toLowerCase();
		items = items.filter((p) => p.fullName.toLowerCase().includes(needle));
	}
	if (country) {
		const upper = country.toUpperCase();
		items = items.filter((p) => p.country?.toUpperCase() === upper);
	}
	if (hasResults === 'true') {
		items = items.filter((p) => (index.placementsByPlayer.get(p.id)?.length ?? 0) > 0);
	}
	if (hasResults === 'false') {
		items = items.filter((p) => (index.placementsByPlayer.get(p.id)?.length ?? 0) === 0);
	}

	items.sort((a, b) => a.fullName.localeCompare(b.fullName));

	return c.json(paginate(items, { limit, offset }), 200);
});

function computeStats(index: Index, playerId: string): PlayerStats {
	const placements = index.placementsByPlayer.get(playerId) ?? [];

	const eventIds = new Set<string>();
	const divisions = new Set<string>();
	const dates: string[] = [];
	let wins = 0;
	let podiums = 0;

	for (const placement of placements) {
		eventIds.add(placement.eventId);
		divisions.add(placement.division);
		if (placement.place === 1) wins++;
		if (placement.place !== null && placement.place <= 3) podiums++;
		if (placement.eventDate) dates.push(placement.eventDate);
	}

	dates.sort();

	return {
		eventCount: eventIds.size,
		placementCount: placements.length,
		wins,
		podiums,
		firstEventDate: dates[0] ?? null,
		lastEventDate: dates[dates.length - 1] ?? null,
		divisions: [...divisions].sort()
	};
}

function currentRankings(index: Index, playerId: string): PlayerRanking[] {
	const rankings: PlayerRanking[] = [];

	for (const series of index.rankings.values()) {
		const entry = series.entries.find((e) => e.playerId === playerId);
		if (!entry) continue;
		rankings.push({
			series: series.series,
			division: series.division,
			rank: entry.rank,
			points: entry.points,
			resultsCount: entry.resultsCount
		});
	}

	return rankings;
}

function currentRatings(index: Index, playerId: string): PlayerRating[] {
	const ratings: PlayerRating[] = [];

	for (const series of index.ratings.values()) {
		const entry = series.entries.find((e) => e.playerId === playerId);
		if (!entry) continue;
		ratings.push({
			series: series.series,
			division: series.division,
			rank: entry.rank,
			rating: entry.rating,
			matchCount: entry.matchCount,
			peakRating: entry.peakRating,
			peakRatingDate: entry.peakRatingDate
		});
	}

	return ratings;
}

const profileRoute = createRoute({
	method: 'get',
	path: '/{playerId}',
	tags: ['Players'],
	summary: 'Get a player profile with career metrics',
	description:
		'Returns the player, aggregate career stats, their current standing in every ranking and ' +
		'rating series, and every recorded placement (most recent first). ' +
		'An alias GUID is accepted; the response always carries the canonical id, so callers can ' +
		'detect the redirect and store the canonical value.',
	request: { params: PlayerIdParam },
	responses: {
		200: {
			description: 'The player profile',
			content: { 'application/json': { schema: PlayerProfileSchema } }
		},
		...notFoundResponse,
		...commonErrors
	}
});

players.openapi(profileRoute, (c) => {
	const index = store.requireIndex();
	const { playerId } = c.req.valid('param');

	const canonicalId = index.canonicalPlayerId.get(playerId) ?? playerId;
	const player = index.players.get(canonicalId);
	if (!player) throw notFound('Player', playerId);

	return c.json(
		{
			player,
			stats: computeStats(index, canonicalId),
			rankings: currentRankings(index, canonicalId),
			ratings: currentRatings(index, canonicalId),
			placements: index.placementsByPlayer.get(canonicalId) ?? []
		},
		200
	);
});
