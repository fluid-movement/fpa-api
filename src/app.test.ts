import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import type { Corpus } from './domain/index-builder.js';
import { store } from './store/store.js';

// The snapshot route is the only one that calls upstream per request.
vi.mock('./upstream/sources.js', () => ({
	sources: {
		pointsSnapshot: vi.fn(async (key: string) =>
			key.startsWith('rating')
				? { data: [{ id: 'p2', fullName: 'James Wiseman', rating: 1500, matchCount: 200 }] }
				: {
						data: [
							{
								id: 'p1',
								fullName: 'Ryan Young',
								rank: 1,
								points: 100,
								pointsList: [{ resultsId: 'r1', points: 100 }]
							}
						]
					}
		)
	}
}));

/**
 * HTTP-level tests against a hydrated in-memory corpus — no network involved.
 *
 * These cover the contract consumers actually depend on: status codes, error
 * shape, pagination, and the parameter validation generated from the Zod
 * schemas.
 */

const fixture: Corpus = {
	fetchedAt: 0,
	players: {
		players: {
			p1: { key: 'p1', firstName: 'Ryan', lastName: 'Young', country: 'USA' },
			p2: { key: 'p2', firstName: 'James', lastName: 'Wiseman', country: 'USA' },
			dupe: { key: 'dupe', firstName: 'ryan', lastName: 'young', aliasKey: 'p1' }
		}
	},
	events: {
		allEventSummaryData: {
			e1: { key: 'e1', eventName: 'Anzio Spring Jam 2026', startDate: '2026-05-17', endDate: '2026-05-18' },
			e2: { key: 'e2', eventName: 'Tokyo Winter Cup 2025', startDate: '2025-12-01', endDate: '2025-12-02' }
		}
	},
	results: {
		results: {
			r1: {
				key: 'r1',
				eventId: 'e1',
				eventName: 'Anzio Spring Jam 2026',
				divisionName: 'Open Pairs',
				resultsData: {
					round1: {
						poolA: {
							poolId: 'A',
							teamData: [
								{ players: ['p1', 'p2'], place: 1, points: 100 },
								{ players: ['p2'], place: 2, points: 50 }
							]
						}
					}
				}
			}
		}
	},
	manifest: {
		manifest: {
			s1: { key: 'ranking-open_2026-1-15', date: '2026-1-15', divisionName: 'open', createdAt: 200 }
		}
	},
	points: {
		data: {
			'ranking-open': [
				{ id: 'p1', fullName: 'Ryan Young', rank: 1, points: 100, resultsCount: 1, pointsList: [{ resultsId: 'r1', points: 100 }] }
			],
			'rating-open': [
				{ id: 'p2', fullName: 'James Wiseman', rating: 1500, matchCount: 200 },
				{ id: 'p1', fullName: 'Ryan Young', rating: 1400, matchCount: 5 }
			]
		}
	},
	directory: null
};

const app = createApp();

beforeAll(() => {
	store.hydrate(fixture);
});

async function get(path: string) {
	const response = await app.request(path);
	return { status: response.status, body: await response.json() };
}

describe('GET /events', () => {
	it('lists events newest first with a pagination envelope', async () => {
		const { status, body } = await get('/events');
		expect(status).toBe(200);
		expect(body.total).toBe(2);
		expect(body.items[0].name).toBe('Anzio Spring Jam 2026');
		expect(body).toMatchObject({ limit: 50, offset: 0 });
	});

	it('filters by name, date range and division', async () => {
		expect((await get('/events?q=tokyo')).body.total).toBe(1);
		expect((await get('/events?from=2026-01-01')).body.total).toBe(1);
		expect((await get('/events?division=Open Pairs')).body.total).toBe(1);
		expect((await get('/events?hasResults=true')).body.total).toBe(1);
	});

	it('paginates', async () => {
		const { body } = await get('/events?limit=1&offset=1');
		expect(body.items).toHaveLength(1);
		expect(body.total).toBe(2);
	});

	it('rejects invalid parameters with the standard error shape', async () => {
		const tooBig = await get('/events?limit=99999');
		expect(tooBig.status).toBe(400);
		expect(tooBig.body).toMatchObject({ status: 400 });
		expect(tooBig.body.error).toContain('limit');

		expect((await get('/events?from=17-05-2026')).status).toBe(400);
		expect((await get('/events?limit=0')).status).toBe(400);
		expect((await get('/events?offset=-1')).status).toBe(400);
	});
});

describe('GET /events/:eventId', () => {
	it('returns the event with its results', async () => {
		const { status, body } = await get('/events/e1');
		expect(status).toBe(200);
		expect(body.event.name).toBe('Anzio Spring Jam 2026');
		expect(body.results[0].rounds[0].pools[0].teams[0].place).toBe(1);
	});

	it('404s for an unknown event', async () => {
		const { status, body } = await get('/events/nope');
		expect(status).toBe(404);
		expect(body).toMatchObject({ status: 404 });
	});
});

describe('GET /players', () => {
	it('lists only canonical players', async () => {
		const { body } = await get('/players');
		// 3 raw entries, one of which is an alias.
		expect(body.total).toBe(2);
	});

	it('searches by name and filters by country', async () => {
		expect((await get('/players?q=wiseman')).body.total).toBe(1);
		expect((await get('/players?country=USA')).body.total).toBe(2);
		expect((await get('/players?country=GER')).body.total).toBe(0);
	});
});

describe('GET /players/:playerId', () => {
	it('returns a profile with stats, rankings and ratings', async () => {
		const { status, body } = await get('/players/p1');
		expect(status).toBe(200);
		expect(body.player.fullName).toBe('Ryan Young');
		expect(body.stats.wins).toBe(1);
		expect(body.stats.eventCount).toBe(1);
		expect(body.rankings[0]).toMatchObject({ series: 'ranking-open', rank: 1, points: 100 });
		expect(body.ratings[0]).toMatchObject({ series: 'rating-open', rating: 1400 });
		expect(body.placements[0].teammates[0].fullName).toBe('James Wiseman');
	});

	it('resolves an alias id and returns the canonical player', async () => {
		const { status, body } = await get('/players/dupe');
		expect(status).toBe(200);
		expect(body.player.id).toBe('p1');
	});

	it('404s for an unknown player', async () => {
		expect((await get('/players/nope')).status).toBe(404);
	});
});

describe('GET /rankings', () => {
	it('defaults to ranking-open and includes the event breakdown', async () => {
		const { status, body } = await get('/rankings');
		expect(status).toBe(200);
		expect(body.series).toBe('ranking-open');
		expect(body.items[0].breakdown[0]).toMatchObject({
			eventId: 'e1',
			eventName: 'Anzio Spring Jam 2026',
			division: 'Open Pairs'
		});
	});

	it('404s for an unknown series and names the valid ones', async () => {
		const { status, body } = await get('/rankings?division=nope');
		expect(status).toBe(404);
		expect(body.error).toContain('ranking-open');
	});

	it('lists available series', async () => {
		const { body } = await get('/rankings/series');
		expect(body.series).toEqual([{ series: 'ranking-open', division: 'open', playerCount: 1 }]);
	});
});

describe('GET /ratings', () => {
	it('ranks by rating descending, not by upstream order', async () => {
		const { body } = await get('/ratings');
		expect(body.items.map((e: { fullName: string }) => e.fullName)).toEqual([
			'James Wiseman',
			'Ryan Young'
		]);
		expect(body.items[0].rank).toBe(1);
	});

	it('filters out statistically weak ratings', async () => {
		const { body } = await get('/ratings?minMatchCount=100');
		expect(body.total).toBe(1);
		expect(body.items[0].fullName).toBe('James Wiseman');
	});

	it('keeps ratings out of the rankings endpoint', async () => {
		expect((await get('/rankings?series=rating-open')).status).toBe(404);
	});
});

describe('GET /snapshots', () => {
	it('lists snapshots with normalized dates', async () => {
		const { body } = await get('/snapshots');
		expect(body.snapshots[0]).toMatchObject({
			key: 'ranking-open_2026-1-15',
			type: 'ranking',
			date: '2026-01-15'
		});
	});

	it('404s for an unknown snapshot without calling upstream', async () => {
		expect((await get('/snapshots/does-not-exist')).status).toBe(404);
	});

	it('resolves the points breakdown against the current results', async () => {
		// Regression: the route used to rebuild a synthetic corpus whose results
		// all normalized away, so every breakdown entry came back with a null
		// eventName.
		const { status, body } = await get('/snapshots/ranking-open_2026-1-15');
		expect(status).toBe(200);
		expect(body.rankings[0].series).toBe('ranking-open');
		expect(body.rankings[0].entries[0].breakdown[0]).toMatchObject({
			eventId: 'e1',
			eventName: 'Anzio Spring Jam 2026'
		});
		expect(body.ratings).toEqual([]);
	});
});

describe('GET /match/events', () => {
	it('ranks candidates and requires a name', async () => {
		const { body } = await get('/match/events?name=Anzio%20Spring%20Jam%202026&startDate=2026-05-17');
		expect(body.candidates[0].event.id).toBe('e1');
		expect(body.candidates[0].confident).toBe(true);

		expect((await get('/match/events')).status).toBe(400);
	});

	it('is not confident about a same-name, different-year event', async () => {
		const { body } = await get('/match/events?name=Anzio%20Spring%20Jam%202026&startDate=2027-05-17');
		expect(body.candidates.every((c: { confident: boolean }) => !c.confident)).toBe(true);
	});
});

describe('operations', () => {
	it('reports health with counts', async () => {
		const { status, body } = await get('/health');
		expect(status).toBe(200);
		expect(body.ready).toBe(true);
		expect(body.counts).toMatchObject({ players: 2, events: 2, results: 1 });
	});

	it('serves a valid OpenAPI document covering every route', async () => {
		const { status, body } = await get('/openapi.json');
		expect(status).toBe(200);
		expect(body.openapi).toBe('3.1.0');
		expect(Object.keys(body.paths)).toEqual(
			expect.arrayContaining([
				'/events',
				'/events/{eventId}',
				'/players',
				'/players/{playerId}',
				'/rankings',
				'/ratings',
				'/snapshots',
				'/match/events',
				'/health'
			])
		);
	});

	it('refuses an unauthenticated refresh', async () => {
		const response = await app.request('/refresh', { method: 'POST' });
		// 503 when REFRESH_TOKEN is unset, 401 when it is set but not supplied.
		expect([401, 503]).toContain(response.status);
	});

	it('404s unknown routes with the standard error shape', async () => {
		const { status, body } = await get('/nope');
		expect(status).toBe(404);
		expect(body).toMatchObject({ error: 'Not found', status: 404 });
	});
});
