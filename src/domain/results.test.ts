import { describe, expect, it } from 'vitest';
import { buildPlayers } from './players.js';
import { normalizeResult, roundName } from './results.js';
import type { RawResult } from '../upstream/types.js';

const { players, canonicalPlayerId } = buildPlayers({
	p1: { key: 'p1', firstName: 'Ryan', lastName: 'Young' },
	p2: { key: 'p2', firstName: 'James', lastName: 'Wiseman' },
	alias: { key: 'alias', firstName: 'ryan', lastName: 'young', aliasKey: 'p1' }
});

function normalize(raw: RawResult) {
	return normalizeResult('r1', raw, players, canonicalPlayerId);
}

describe('roundName', () => {
	it('names the rounds it knows', () => {
		// Round 1 is the FINAL, counting backwards — not the first round played.
		expect(roundName(1)).toBe('Finals');
		expect(roundName(2)).toBe('Semifinals');
		expect(roundName(3)).toBe('Quarterfinals');
	});

	it('falls back for deeper rounds', () => {
		// Production has rounds up to 7.
		expect(roundName(7)).toBe('Round 7');
	});
});

describe('normalizeResult', () => {
	it('normalizes a straightforward result', () => {
		const result = normalize({
			key: 'r1',
			eventId: 'e1',
			eventName: 'Test Event',
			divisionName: 'Open Pairs',
			createdAt: 1000,
			resultsData: {
				divisionName: 'Open Pairs',
				eventId: 'e1',
				round1: { id: 1, poolA: { poolId: 'A', teamData: [{ players: ['p1', 'p2'], place: 1, points: 100 }] } }
			}
		});

		expect(result).not.toBeNull();
		expect(result!.division).toBe('Open Pairs');
		expect(result!.rounds).toHaveLength(1);
		expect(result!.rounds[0]!.name).toBe('Finals');
		expect(result!.rounds[0]!.pools[0]!.teams[0]!.players.map((p) => p.fullName)).toEqual([
			'Ryan Young',
			'James Wiseman'
		]);
	});

	it('resolves alias player ids inside results to canonical players', () => {
		const result = normalize({
			key: 'r1',
			eventId: 'e1',
			divisionName: 'Open Pairs',
			resultsData: {
				round1: { poolA: { poolId: 'A', teamData: [{ players: ['alias'], place: 1, points: 1 }] } }
			}
		});

		const member = result!.rounds[0]!.pools[0]!.teams[0]!.players[0]!;
		expect(member.id).toBe('p1');
		expect(member.unknown).toBe(false);
	});

	it('keeps a team member whose id is missing from the directory, flagged', () => {
		const result = normalize({
			key: 'r1',
			eventId: 'e1',
			divisionName: 'Open Pairs',
			resultsData: {
				round1: { poolA: { poolId: 'A', teamData: [{ players: ['ghost'], place: 1, points: 1 }] } }
			}
		});

		const member = result!.rounds[0]!.pools[0]!.teams[0]!.players[0]!;
		expect(member.unknown).toBe(true);
		expect(member.fullName).toBe('Unknown Player');
	});

	it('reads lowercase pool keys', () => {
		// `poola` occurs in production alongside the usual `poolA`.
		const result = normalize({
			key: 'r1',
			eventId: 'e1',
			divisionName: 'Open Pairs',
			resultsData: {
				round1: { poola: { poolId: 'A', teamData: [{ players: ['p1'], place: 1, points: 1 }] } }
			}
		});

		expect(result!.rounds[0]!.pools).toHaveLength(1);
		expect(result!.rounds[0]!.pools[0]!.name).toBe('A');
	});

	it('handles non-contiguous round numbers', () => {
		// round1 + round3 + round5 with gaps is normal upstream.
		const result = normalize({
			key: 'r1',
			eventId: 'e1',
			divisionName: 'Open Pairs',
			resultsData: {
				round1: { poolA: { poolId: 'A', teamData: [{ players: ['p1'], place: 1, points: 1 }] } },
				round3: { poolA: { poolId: 'A', teamData: [{ players: ['p1'], place: 2, points: 2 }] } },
				round5: { poolA: { poolId: 'A', teamData: [{ players: ['p1'], place: 3, points: 3 }] } }
			}
		});

		expect(result!.rounds.map((r) => r.number)).toEqual([1, 3, 5]);
	});

	it('orders teams by placement', () => {
		const result = normalize({
			key: 'r1',
			eventId: 'e1',
			divisionName: 'Open Pairs',
			resultsData: {
				round1: {
					poolA: {
						poolId: 'A',
						teamData: [
							{ players: ['p1'], place: 3, points: 1 },
							{ players: ['p2'], place: 1, points: 2 }
						]
					}
				}
			}
		});

		expect(result!.rounds[0]!.pools[0]!.teams.map((t) => t.place)).toEqual([1, 3]);
	});

	it('preserves the raw division name alongside the canonical one', () => {
		const result = normalize({
			key: 'r1',
			eventId: 'e1',
			divisionName: 'open pairs',
			resultsData: {
				round1: { poolA: { poolId: 'A', teamData: [{ players: ['p1'], place: 1, points: 1 }] } }
			}
		});

		expect(result!.division).toBe('Open Pairs');
		expect(result!.divisionRaw).toBe('open pairs');
	});

	it('drops hidden results', () => {
		expect(
			normalize({
				key: 'r1',
				eventId: 'e1',
				divisionName: 'Open Pairs',
				resultsData: {
					isHidden: true,
					round1: { poolA: { poolId: 'A', teamData: [{ players: ['p1'], place: 1, points: 1 }] } }
				}
			})
		).toBeNull();
	});

	it('drops records with no usable rounds or no event', () => {
		expect(normalize({ key: 'r1', eventId: 'e1', resultsData: { divisionName: 'Open Pairs' } })).toBeNull();
		expect(normalize({ key: 'r1', resultsData: { round1: {} } })).toBeNull();
		expect(normalize({ key: 'r1' })).toBeNull();
	});

	it('survives malformed round and pool values', () => {
		const result = normalize({
			key: 'r1',
			eventId: 'e1',
			divisionName: 'Open Pairs',
			resultsData: {
				round1: {
					poolA: { poolId: 'A', teamData: [{ players: ['p1'], place: 1, points: 1 }] },
					poolB: 'not an object',
					notAPool: { poolId: 'X' }
				},
				round2: null,
				roundX: { poolA: {} }
			}
		});

		expect(result!.rounds).toHaveLength(1);
		expect(result!.rounds[0]!.pools).toHaveLength(1);
	});

	it('tolerates a pool with missing team data', () => {
		const result = normalize({
			key: 'r1',
			eventId: 'e1',
			divisionName: 'Open Pairs',
			resultsData: {
				round1: {
					poolA: { poolId: 'A' },
					poolB: { poolId: 'B', teamData: [{ players: ['p1'], place: 1, points: 1 }] }
				}
			}
		});

		expect(result!.rounds[0]!.pools).toHaveLength(2);
		expect(result!.rounds[0]!.pools[0]!.teams).toEqual([]);
	});
});
