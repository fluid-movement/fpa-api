import { describe, expect, it } from 'vitest';
import { buildPlayers, lookupPlayer } from './players.js';
import type { RawPlayer } from '../upstream/types.js';

/**
 * Alias resolution is the highest-risk normalization in this service: upstream
 * has no referential integrity, and their own documentation lists alias loops
 * as a defect that hangs their points generation. These tests exist to prove
 * that no upstream data shape can hang or crash us.
 */

function player(id: string, first: string, last: string, aliasKey?: string): RawPlayer {
	return { key: id, firstName: first, lastName: last, ...(aliasKey ? { aliasKey } : {}) };
}

describe('buildPlayers', () => {
	it('keeps players that have no alias', () => {
		const { players, warnings } = buildPlayers({
			a: player('a', 'Ryan', 'Young')
		});

		expect(players.size).toBe(1);
		expect(players.get('a')?.fullName).toBe('Ryan Young');
		expect(warnings).toEqual([]);
	});

	it('merges an alias into its canonical player', () => {
		const { players, canonicalPlayerId } = buildPlayers({
			canonical: player('canonical', 'Ryan', 'Young'),
			dupe: player('dupe', 'ryan', 'young', 'canonical')
		});

		expect(players.size).toBe(1);
		expect(players.has('canonical')).toBe(true);
		expect(players.get('canonical')?.aliasIds).toEqual(['dupe']);
		expect(canonicalPlayerId.get('dupe')).toBe('canonical');
	});

	it('follows a multi-step alias chain to its end', () => {
		// Production currently contains chains up to 3 deep.
		const { players, canonicalPlayerId } = buildPlayers({
			a: player('a', 'A', 'One', 'b'),
			b: player('b', 'B', 'Two', 'c'),
			c: player('c', 'C', 'Three')
		});

		expect(players.size).toBe(1);
		expect(canonicalPlayerId.get('a')).toBe('c');
		expect(canonicalPlayerId.get('b')).toBe('c');
		expect(players.get('c')?.aliasIds).toEqual(['a', 'b']);
	});

	it('terminates on a two-node alias loop without losing the players', () => {
		// Regression: stopping where the loop was detected made a -> b resolve
		// to b and b -> a resolve to a, so neither was its own canonical and
		// both players vanished from the output entirely.
		const { players, canonicalPlayerId, warnings } = buildPlayers({
			a: player('a', 'A', 'One', 'b'),
			b: player('b', 'B', 'Two', 'a')
		});

		expect(warnings.some((w) => w.includes('Alias loop'))).toBe(true);
		expect(players.size).toBe(1);
		// Every member of the cycle must agree on one canonical id...
		expect(canonicalPlayerId.get('a')).toBe(canonicalPlayerId.get('b'));
		// ...and that id must actually exist in the output.
		expect(players.has(canonicalPlayerId.get('a')!)).toBe(true);
	});

	it('terminates on a self-referencing alias', () => {
		const { players, canonicalPlayerId, warnings } = buildPlayers({
			a: player('a', 'A', 'One', 'a')
		});

		expect(warnings.some((w) => w.includes('Alias loop'))).toBe(true);
		expect(players.size).toBe(1);
		expect(canonicalPlayerId.get('a')).toBe('a');
	});

	it('terminates on a longer alias cycle and keeps one canonical player', () => {
		const { players, canonicalPlayerId, warnings } = buildPlayers({
			a: player('a', 'A', 'One', 'b'),
			b: player('b', 'B', 'Two', 'c'),
			c: player('c', 'C', 'Three', 'a')
		});

		expect(warnings.some((w) => w.includes('Alias loop'))).toBe(true);
		expect(players.size).toBe(1);
		expect(new Set(['a', 'b', 'c'].map((id) => canonicalPlayerId.get(id))).size).toBe(1);
		expect(players.has(canonicalPlayerId.get('a')!)).toBe(true);
	});

	it('resolves a chain that leads into a cycle consistently', () => {
		// x -> a -> b -> a. The tail must not change which node the cycle picks.
		const { players, canonicalPlayerId } = buildPlayers({
			x: player('x', 'X', 'Tail', 'a'),
			a: player('a', 'A', 'One', 'b'),
			b: player('b', 'B', 'Two', 'a')
		});

		expect(canonicalPlayerId.get('x')).toBe(canonicalPlayerId.get('a'));
		expect(players.size).toBe(1);
		expect(players.has(canonicalPlayerId.get('x')!)).toBe(true);
	});

	it('handles an alias pointing at a player that does not exist', () => {
		// One real record in production does exactly this.
		const { players, canonicalPlayerId, warnings } = buildPlayers({
			a: player('a', 'Charlene', 'Powell', 'ghost')
		});

		expect(players.size).toBe(1);
		expect(canonicalPlayerId.get('a')).toBe('a');
		expect(warnings.some((w) => w.includes('aliases missing player'))).toBe(true);
	});

	it('falls back to a placeholder when a player has no name', () => {
		const { players } = buildPlayers({ a: { key: 'a' } });
		expect(players.get('a')?.fullName).toBe('Unknown Player');
	});

	it('withholds personal fields by default', () => {
		const { players } = buildPlayers({
			a: { key: 'a', firstName: 'Ryan', lastName: 'Young', gender: 'M', membership: 42 }
		});

		expect(players.get('a')?.gender).toBeNull();
		expect(players.get('a')?.membership).toBeNull();
	});
});

describe('lookupPlayer', () => {
	const { players, canonicalPlayerId } = buildPlayers({
		canonical: player('canonical', 'Ryan', 'Young'),
		dupe: player('dupe', 'ryan', 'young', 'canonical')
	});

	it('resolves an alias id to the canonical player', () => {
		expect(lookupPlayer('dupe', players, canonicalPlayerId)).toEqual({
			id: 'canonical',
			fullName: 'Ryan Young',
			unknown: false
		});
	});

	it('flags an id absent from the directory instead of dropping it', () => {
		// Production has a player id in results that is not in the directory.
		// Losing that team member silently would be worse than showing it.
		expect(lookupPlayer('ghost', players, canonicalPlayerId)).toEqual({
			id: 'ghost',
			fullName: 'Unknown Player',
			unknown: true
		});
	});
});
