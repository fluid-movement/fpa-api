import { describe, expect, it } from 'vitest';
import { buildPlayers } from '../domain/players.js';
import { normalizeResult } from '../domain/results.js';
import {
	adaptEvents,
	adaptLatestPoints,
	adaptPlayers,
	adaptPointsManifest,
	latestSnapshotKeys
} from './adapter.js';
import type { SyncEvent } from './types.js';

/** The example event from docs/SYNC_API.md, with a second round and pool added. */
const FPAW: SyncEvent = {
	id: '48721b44-142a-437d-9d6e-5979dd06435c',
	name: 'FPAW 2026',
	startDate: '2026-07-29',
	endDate: '2026-08-02',
	fpaId: null,
	postName: null,
	divisions: [
		{
			id: 'cc92e5ad-b2ee-421a-8d9c-996acf8dfeee',
			name: 'Mixed Pairs',
			rounds: [
				{
					number: 1,
					pools: [
						{
							pool: 'A',
							teams: [
								{ place: 1, points: 137.31, playerIds: ['p1', 'p2'] },
								{ place: 2, points: null, playerIds: ['p3'] }
							]
						}
					]
				},
				{
					number: 3,
					pools: [
						{ pool: 'A', teams: [{ place: 1, points: 90, playerIds: ['p1', 'p2'] }] },
						{ pool: 'B', teams: [{ place: 1, points: 88, playerIds: [] }] }
					]
				}
			]
		}
	]
};

describe('adaptPlayers', () => {
	it('keys players by id and maps aliasId to aliasKey, carrying hidden', () => {
		const raw = adaptPlayers([
			{
				id: 'p1',
				firstName: 'Francesco',
				lastName: 'Santolin',
				country: 'ITA',
				fpaWebsiteId: null,
				aliasId: null,
				hidden: false
			},
			{ id: 'p2', firstName: 'f', lastName: 'santolin', country: null, fpaWebsiteId: 2422, aliasId: 'p1', hidden: true }
		]);

		expect(raw.players).toEqual({
			p1: { key: 'p1', firstName: 'Francesco', lastName: 'Santolin', country: 'ITA' },
			p2: { key: 'p2', firstName: 'f', lastName: 'santolin', fpaWebsiteId: '2422', aliasKey: 'p1', hidden: true }
		});
	});

	it('feeds the existing alias resolution unchanged', () => {
		const raw = adaptPlayers([
			{ id: 'a', firstName: 'Ryan', lastName: 'Young', aliasId: null },
			{ id: 'b', firstName: 'ryan', lastName: 'young', aliasId: 'c' },
			{ id: 'c', firstName: 'Ryan', lastName: 'Young', aliasId: 'a' }
		]);
		const { players, canonicalPlayerId } = buildPlayers(raw.players!);

		expect([...players.keys()]).toEqual(['a']);
		expect(canonicalPlayerId.get('b')).toBe('a');
		expect(players.get('a')!.aliasIds).toEqual(['b', 'c']);
	});

	it('skips entries without an id', () => {
		expect(adaptPlayers([{ firstName: 'Nobody' }]).players).toEqual({});
	});
});

describe('adaptEvents', () => {
	it('maps an event to an event summary with fpaId/postName under additionalData', () => {
		const { events } = adaptEvents([{ ...FPAW, fpaId: 1159, postName: 'fpaw-2026' }]);

		expect(events.allEventSummaryData).toEqual({
			[FPAW.id!]: {
				key: FPAW.id,
				eventName: 'FPAW 2026',
				startDate: '2026-07-29',
				endDate: '2026-08-02',
				additionalData: { fpaId: '1159', postName: 'fpaw-2026' }
			}
		});
	});

	it('makes one result per division, keyed by the division id, in the legacy round/pool layout', () => {
		const { results } = adaptEvents([FPAW]);
		const result = results.results!['cc92e5ad-b2ee-421a-8d9c-996acf8dfeee']!;

		expect(result).toEqual({
			key: 'cc92e5ad-b2ee-421a-8d9c-996acf8dfeee',
			eventId: FPAW.id,
			eventName: 'FPAW 2026',
			divisionName: 'Mixed Pairs',
			resultsData: {
				divisionName: 'Mixed Pairs',
				eventId: FPAW.id,
				round1: {
					id: 1,
					poolA: {
						poolId: 'A',
						teamData: [
							{ players: ['p1', 'p2'], place: 1, points: 137.31 },
							{ players: ['p3'], place: 2, points: undefined }
						]
					}
				},
				round3: {
					id: 3,
					poolA: { poolId: 'A', teamData: [{ players: ['p1', 'p2'], place: 1, points: 90 }] },
					poolB: { poolId: 'B', teamData: [{ players: [], place: 1, points: 88 }] }
				}
			}
		});
	});

	it('produces exactly what the results normalizer reads', () => {
		const { results } = adaptEvents([FPAW]);
		const { players, canonicalPlayerId } = buildPlayers(
			adaptPlayers([
				{ id: 'p1', firstName: 'Ryan', lastName: 'Young' },
				{ id: 'p2', firstName: 'James', lastName: 'Wiseman' },
				{ id: 'p3', firstName: 'Lisa', lastName: 'Hunrichs', hidden: true }
			]).players!
		);
		const id = 'cc92e5ad-b2ee-421a-8d9c-996acf8dfeee';
		const normalized = normalizeResult(id, results.results![id]!, players, canonicalPlayerId)!;

		expect(normalized).toMatchObject({ id, eventId: FPAW.id, eventName: 'FPAW 2026', divisionRaw: 'Mixed Pairs' });
		expect(normalized.rounds.map((r) => [r.number, r.name, r.pools.map((p) => p.name)])).toEqual([
			[1, 'Finals', ['A']],
			[3, 'Quarterfinals', ['A', 'B']]
		]);
		const final = normalized.rounds[0]!.pools[0]!.teams;
		expect(final[0]).toEqual({
			place: 1,
			points: 137.31,
			players: [
				{ id: 'p1', fullName: 'Ryan Young', unknown: false },
				{ id: 'p2', fullName: 'James Wiseman', unknown: false }
			]
		});
		// Null points stay null; a hidden player is still named.
		expect(final[1]).toEqual({
			place: 2,
			points: null,
			players: [{ id: 'p3', fullName: 'Lisa Hunrichs', unknown: false }]
		});
	});

	it('merges a pool letter that occurs twice in one round rather than losing teams', () => {
		const { results } = adaptEvents([
			{
				id: 'e',
				divisions: [
					{
						id: 'd',
						name: 'Open Pairs',
						rounds: [
							{
								number: 1,
								pools: [
									{ pool: 'a', teams: [{ place: 1, playerIds: ['x'] }] },
									{ pool: 'A', teams: [{ place: 2, playerIds: ['y'] }] }
								]
							}
						]
					}
				]
			}
		]);
		const round1 = results.results!.d!.resultsData!.round1 as Record<string, { teamData: unknown[] }>;
		expect(Object.keys(round1)).toEqual(['id', 'poolA']);
		expect(round1.poolA!.teamData).toHaveLength(2);
	});

	it('skips events and divisions without ids, and rounds without a number', () => {
		const { events, results } = adaptEvents([
			{ name: 'no id' },
			{ id: 'e', divisions: [{ name: 'no id' }, { id: 'd', rounds: [{ pools: [] }] }] }
		]);

		expect(Object.keys(events.allEventSummaryData!)).toEqual(['e']);
		expect(Object.keys(results.results!)).toEqual(['d']);
		expect(Object.keys(results.results!.d!.resultsData!)).toEqual(['divisionName', 'eventId']);
	});
});

describe('points', () => {
	it('normalizes manifest createdAt to epoch milliseconds', () => {
		const manifest = adaptPointsManifest({
			manifest: {
				a: { key: 'ranking-open_2026-11-5', createdAt: '2026-11-05T10:00:00.000Z' },
				b: { key: 'ranking-open_2026-10-1', createdAt: 1759312800000 },
				c: { key: 'rating-open_2026-10-1', createdAt: 'not a date' }
			}
		});

		expect(manifest.manifest!.a!.createdAt).toBe(Date.parse('2026-11-05T10:00:00.000Z'));
		expect(manifest.manifest!.b!.createdAt).toBe(1759312800000);
		expect(manifest.manifest!.c!.createdAt).toBeUndefined();
	});

	it('picks the newest visible snapshot of every series', () => {
		const keys = latestSnapshotKeys({
			manifest: {
				a: { key: 'ranking-open_2026-1-15', date: '2026-1-15', createdAt: 200 },
				b: { key: 'ranking-open_2026-11-5', date: '2026-11-5', createdAt: 300, isHidden: true },
				c: { key: 'ranking-open_2025-7-3', date: '2025-7-3', createdAt: 100 },
				d: { key: 'rating-open_2026-2-1', date: '2026-2-1', createdAt: 50 },
				e: { key: 'ranking-women_2026-1-1', date: '2026-1-1' },
				f: { key: 'ranking-women_2026-10-1', date: '2026-10-1' }
			}
		});

		expect(keys).toEqual({
			'ranking-open': 'ranking-open_2026-1-15',
			'rating-open': 'rating-open_2026-2-1',
			// No createdAt: the padded date decides ('2026-10-01' > '2026-01-01').
			'ranking-women': 'ranking-women_2026-10-1'
		});
	});

	it('assembles the latest snapshots into the series-keyed points shape', () => {
		const ranking = [{ id: 'p1', fullName: 'Ryan Young', rank: 1, points: 100 }];
		const rating = [{ id: 'p1', fullName: 'Ryan Young', rating: 1700, matchCount: 10 }];

		expect(
			adaptLatestPoints({
				'ranking-open': { key: 'ranking-open_2026-1-15', payload: { data: ranking } },
				// Already series-keyed: accepted too.
				'rating-open': { key: 'rating-open_2026-2-1', payload: { data: { 'rating-open': rating } } },
				'ranking-women': { key: 'ranking-women_2026-1-1', payload: {} }
			})
		).toEqual({ data: { 'ranking-open': ranking, 'rating-open': rating } });
	});
});
