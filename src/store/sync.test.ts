import { describe, expect, it } from 'vitest';
import type { SyncEvent } from '../upstream/types.js';
import {
	batches,
	isEmptyPlan,
	mergeEvents,
	planSync,
	toCorpus,
	validateManifest,
	type SyncState
} from './sync.js';

const ev = (id: string, name = id): SyncEvent => ({ id, name, divisions: [] });

function stored(overrides: Partial<SyncState> = {}): SyncState {
	return {
		fetchedAt: 1,
		formatVersion: 1,
		generatedAt: null,
		events: {
			e1: { hash: 'h1', event: ev('e1') },
			e2: { hash: 'h2', event: ev('e2') }
		},
		players: { hash: 'hp', players: [] },
		pointsManifest: {},
		points: { 'ranking-open': { key: 'ranking-open_2026-1-1', payload: { data: [] } } },
		profiles: null,
		...overrides
	};
}

const sameManifest = { events: { e1: 'h1', e2: 'h2' }, players: { hash: 'hp' } };
const samePoints = { 'ranking-open': 'ranking-open_2026-1-1' };

describe('planSync', () => {
	it('fetches everything on a first sync', () => {
		const plan = planSync(null, sameManifest, samePoints);
		expect(plan).toEqual({
			fetchEvents: ['e1', 'e2'],
			removeEvents: [],
			fetchPlayers: true,
			fetchPoints: samePoints,
			removePoints: []
		});
	});

	it('plans nothing when nothing changed', () => {
		const plan = planSync(stored(), sameManifest, samePoints);
		expect(isEmptyPlan(plan)).toBe(true);
	});

	it('fetches new and changed events and removes those that left the manifest', () => {
		const plan = planSync(stored(), { events: { e1: 'h1-changed', e3: 'h3' }, players: { hash: 'hp' } }, samePoints);
		expect(plan.fetchEvents).toEqual(['e1', 'e3']);
		expect(plan.removeEvents).toEqual(['e2']);
		expect(plan.fetchPlayers).toBe(false);
	});

	it('refetches players when their hash changed', () => {
		const plan = planSync(stored(), { ...sameManifest, players: { hash: 'hp2' } }, samePoints);
		expect(plan.fetchPlayers).toBe(true);
		expect(plan.fetchEvents).toEqual([]);
	});

	it("downloads a series only when its latest key changed, and drops series that vanished", () => {
		const plan = planSync(stored(), sameManifest, {
			'ranking-open': 'ranking-open_2026-2-1',
			'rating-open': 'rating-open_2026-2-1'
		});
		expect(plan.fetchPoints).toEqual({
			'ranking-open': 'ranking-open_2026-2-1',
			'rating-open': 'rating-open_2026-2-1'
		});

		expect(planSync(stored(), sameManifest, {}).removePoints).toEqual(['ranking-open']);
	});

	it('leaves points alone when the points manifest is unavailable', () => {
		const plan = planSync(stored(), sameManifest, null);
		expect(plan.fetchPoints).toEqual({});
		expect(plan.removePoints).toEqual([]);
	});
});

describe('mergeEvents', () => {
	it('applies fetched events under their manifest hash and drops removed ones', () => {
		const { events, missing } = mergeEvents(
			stored().events,
			{ fetchEvents: ['e1', 'e3'], removeEvents: ['e2'] },
			{ e1: 'h1b', e3: 'h3' },
			[ev('e1', 'changed'), ev('e3')]
		);

		expect(missing).toEqual([]);
		expect(events).toEqual({
			e1: { hash: 'h1b', event: ev('e1', 'changed') },
			e3: { hash: 'h3', event: ev('e3') }
		});
	});

	it('treats a requested event that did not come back as gone, stored copy included', () => {
		const { events, missing } = mergeEvents(
			stored().events,
			{ fetchEvents: ['e1', 'e3'], removeEvents: [] },
			{ e1: 'h1b', e2: 'h2', e3: 'h3' },
			[ev('e3'), ev('unrequested')]
		);

		expect(missing).toEqual(['e1']);
		expect(Object.keys(events).sort()).toEqual(['e2', 'e3']);
	});
});

describe('validateManifest', () => {
	const ok = { formatVersion: 1, generatedAt: 'x', players: { hash: 'h', count: 2 }, events: { e1: 'h1' } };

	it('accepts the contract shape', () => {
		expect(validateManifest(ok)).toEqual({ ...ok, players: { hash: 'h', count: 2 } });
	});

	it.each([
		['an unknown formatVersion', { ...ok, formatVersion: 2 }, 'Unsupported sync formatVersion 2'],
		['no players hash', { ...ok, players: {} }, 'no players hash'],
		['no events map', { ...ok, events: undefined }, 'no events map'],
		['a non-string hash', { ...ok, events: { e1: 5 } }, 'non-string hash for event e1']
	])('rejects %s', (_case, manifest, message) => {
		expect(() => validateManifest(manifest as never)).toThrow(message);
	});
});

describe('toCorpus', () => {
	it('derives the normalizer corpus through the adapter', () => {
		const corpus = toCorpus(
			stored({
				events: {
					e1: {
						hash: 'h1',
						event: { id: 'e1', name: 'Jam', divisions: [{ id: 'd1', name: 'Open Pairs', rounds: [] }] }
					}
				},
				players: { hash: 'hp', players: [{ id: 'p1', firstName: 'Ryan', lastName: 'Young' }] }
			})
		);

		expect(Object.keys(corpus.events.allEventSummaryData!)).toEqual(['e1']);
		expect(corpus.results.results!.d1!.eventId).toBe('e1');
		expect(corpus.players.players!.p1!.firstName).toBe('Ryan');
		expect(corpus.points).toEqual({ data: { 'ranking-open': [] } });
	});
});

describe('batches', () => {
	it('splits into chunks of at most the given size', () => {
		expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(batches([], 50)).toEqual([]);
	});
});
