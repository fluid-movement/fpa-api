import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { commonErrors } from '../lib/http.js';
import { rankCandidates } from '../lib/matching.js';
import { EventSummarySchema, PlayerSchema } from '../schemas/domain.js';
import { MatchEventQuery, MatchPlayerQuery } from '../schemas/params.js';
import { store } from '../store/store.js';

export const match = new OpenAPIHono();

const MATCH_NOTE =
	'Results are suggestions ranked by similarity, never an automatic link. fpa-events and the ' +
	'upstream services share no identifier, so a confident-looking match can still be the wrong ' +
	'year or a junior division. Always require human confirmation before storing the id.';

const eventMatchRoute = createRoute({
	method: 'get',
	path: '/events',
	tags: ['Matching'],
	summary: 'Find upstream events that may correspond to one of ours',
	description: MATCH_NOTE,
	request: { query: MatchEventQuery },
	responses: {
		200: {
			description: 'Ranked candidate events, best first',
			content: {
				'application/json': {
					schema: z
						.object({
							query: z.object({ name: z.string(), startDate: z.string().nullable() }),
							candidates: z.array(
								z.object({
									event: EventSummarySchema,
									score: z.number().describe('Combined score, 0 to 1'),
									nameScore: z.number(),
									dateScore: z.number(),
									confident: z
										.boolean()
										.describe('Near-certain match, but still requires confirmation')
								})
							)
						})
						.openapi('EventMatches')
				}
			}
		},
		...commonErrors
	}
});

match.openapi(eventMatchRoute, (c) => {
	const index = store.requireIndex();
	const { name, startDate, hasResults } = c.req.valid('query');

	let candidates = [...index.events.values()];
	if (hasResults !== 'false') candidates = candidates.filter((e) => e.resultCount > 0);

	const ranked = rankCandidates(
		candidates,
		{ name, startDate: startDate ?? null },
		{ name: (e) => e.name, startDate: (e) => e.startDate }
	);

	return c.json(
		{
			query: { name, startDate: startDate ?? null },
			candidates: ranked.map((candidate) => ({
				event: candidate.item,
				score: Number(candidate.score.toFixed(3)),
				nameScore: Number(candidate.nameScore.toFixed(3)),
				dateScore: Number(candidate.dateScore.toFixed(3)),
				confident: candidate.confident
			}))
		},
		200
	);
});

const playerMatchRoute = createRoute({
	method: 'get',
	path: '/players',
	tags: ['Matching'],
	summary: 'Find upstream players that may correspond to one of our users',
	description: `${MATCH_NOTE} Names are especially unreliable here — several people in the directory share a name.`,
	request: { query: MatchPlayerQuery },
	responses: {
		200: {
			description: 'Ranked candidate players, best first',
			content: {
				'application/json': {
					schema: z
						.object({
							query: z.object({ name: z.string() }),
							candidates: z.array(
								z.object({
									player: PlayerSchema,
									score: z.number(),
									placementCount: z
										.number()
										.describe('Use as a tiebreaker: an active player is the likelier match'),
									confident: z.boolean()
								})
							)
						})
						.openapi('PlayerMatches')
				}
			}
		},
		...commonErrors
	}
});

match.openapi(playerMatchRoute, (c) => {
	const index = store.requireIndex();
	const { name } = c.req.valid('query');

	const ranked = rankCandidates(
		[...index.players.values()],
		{ name },
		{ name: (p) => p.fullName, startDate: () => null }
	);

	return c.json(
		{
			query: { name },
			candidates: ranked.map((candidate) => ({
				player: candidate.item,
				score: Number(candidate.score.toFixed(3)),
				placementCount: index.placementsByPlayer.get(candidate.item.id)?.length ?? 0,
				confident: candidate.confident
			}))
		},
		200
	);
});
