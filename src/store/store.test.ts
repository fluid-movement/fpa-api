import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncEvent, SyncPlayer } from '../upstream/types.js';
import type { SyncState } from './sync.js';

const fetchers = {
	syncManifest: vi.fn(),
	syncEvents: vi.fn(),
	syncPlayers: vi.fn(),
	pointsManifest: vi.fn(),
	pointsSnapshot: vi.fn(),
	profiles: vi.fn()
};

vi.mock('../upstream/sources.js', () => ({ sources: fetchers, SYNC_EVENTS_BATCH_SIZE: 50 }));
vi.mock('./snapshot.js', () => ({
	loadSnapshot: vi.fn(async () => null),
	saveSnapshot: vi.fn(async () => {})
}));

const { Store } = await import('./store.js');
const { loadSnapshot, saveSnapshot } = await import('./snapshot.js');

function event(id: string, name: string, playerIds = ['p1']): SyncEvent {
	return {
		id,
		name,
		startDate: '2026-05-01',
		endDate: '2026-05-02',
		fpaId: null,
		postName: null,
		divisions: [
			{
				id: `${id}-open`,
				name: 'Open Pairs',
				rounds: [{ number: 1, pools: [{ pool: 'A', teams: [{ place: 1, points: 10, playerIds }] }] }]
			}
		]
	};
}

/**
 * A fake FullstackFreestyleTools: the tests change its data, and the mocked
 * sources answer from it the way docs/SYNC_API.md says the real one does.
 */
let upstream: {
	events: Record<string, { hash: string; event: SyncEvent }>;
	players: SyncPlayer[];
	playersHash: string;
	pointsManifest: Record<string, { key: string; createdAt: number; isHidden?: boolean }>;
	snapshots: Record<string, unknown>;
};

function resetUpstream() {
	upstream = {
		events: {
			e1: { hash: 'h1', event: event('e1', 'Spring Jam') },
			e2: { hash: 'h2', event: event('e2', 'Winter Cup') }
		},
		players: [{ id: 'p1', firstName: 'Ryan', lastName: 'Young', aliasId: null, hidden: false }],
		playersHash: 'players-1',
		pointsManifest: { a: { key: 'ranking-open_2026-1-1', createdAt: 100 } },
		snapshots: {
			'ranking-open_2026-1-1': { data: [{ id: 'p1', fullName: 'Ryan Young', rank: 1, points: 10 }] },
			'ranking-open_2026-2-1': { data: [{ id: 'p1', fullName: 'Ryan Young', rank: 1, points: 20 }] }
		}
	};
}

function wireUpstream() {
	fetchers.syncManifest.mockImplementation(async () => ({
		formatVersion: 1,
		generatedAt: '2026-11-23T10:00:00.000Z',
		players: { hash: upstream.playersHash, count: upstream.players.length },
		events: Object.fromEntries(Object.entries(upstream.events).map(([id, { hash }]) => [id, hash]))
	}));
	fetchers.syncEvents.mockImplementation(async (ids: string[]) => ({
		events: ids.filter((id) => upstream.events[id]).map((id) => upstream.events[id]!.event)
	}));
	fetchers.syncPlayers.mockImplementation(async () => ({ players: upstream.players }));
	fetchers.pointsManifest.mockImplementation(async () => ({ manifest: upstream.pointsManifest }));
	fetchers.pointsSnapshot.mockImplementation(async (key: string) => {
		if (!upstream.snapshots[key]) throw new Error(`no snapshot ${key}`);
		return upstream.snapshots[key];
	});
}

function allFail() {
	const boom = () => Promise.reject(new Error('upstream down'));
	for (const fetcher of Object.values(fetchers)) fetcher.mockImplementation(boom);
}

beforeEach(() => {
	vi.clearAllMocks();
	resetUpstream();
	wireUpstream();
});

describe('Store.refresh: first sync', () => {
	it('fetches everything, builds an index and reports a network origin', async () => {
		const store = new Store();

		expect(await store.refresh()).toBe(true);
		expect(store.status).toMatchObject({ ready: true, origin: 'network' });
		expect(store.status.counts).toMatchObject({ players: 1, events: 2, results: 2, rankingSeries: 1 });
		expect(store.status.lastFullRefreshAt).not.toBeNull();
		expect(store.status.sync).toMatchObject({
			formatVersion: 1,
			events: 2,
			playersHash: 'players-1',
			pointsKeys: { 'ranking-open': 'ranking-open_2026-1-1' },
			lastChanges: { requests: 5, eventsFetched: 2, playersFetched: true, pointsFetched: ['ranking-open'] }
		});
		expect(fetchers.syncEvents).toHaveBeenCalledWith(['e1', 'e2']);
		expect(saveSnapshot).toHaveBeenCalledOnce();
	});

	it('fetches events in batches of at most 50', async () => {
		upstream.events = {};
		for (let i = 0; i < 120; i++) {
			const id = `e${String(i).padStart(3, '0')}`;
			upstream.events[id] = { hash: `h${i}`, event: event(id, `Event ${i}`) };
		}
		const store = new Store();

		await store.refresh();

		expect(fetchers.syncEvents.mock.calls.map(([ids]) => ids.length)).toEqual([50, 50, 20]);
		expect(store.status.counts).toMatchObject({ events: 120 });
	});

	it('fails cleanly when there is no data and no prior state', async () => {
		allFail();
		const store = new Store();

		expect(await store.refresh()).toBe(false);
		expect(store.status.ready).toBe(false);
		expect(store.status.sources.syncManifest.lastError).toContain('upstream down');
	});

	it('refuses a sync manifest in an unknown format', async () => {
		fetchers.syncManifest.mockResolvedValue({ formatVersion: 2, players: { hash: 'x' }, events: {} });
		const store = new Store();

		expect(await store.refresh()).toBe(false);
		expect(store.status.sources.syncManifest.lastError).toContain('Unsupported sync formatVersion 2');
		expect(fetchers.syncEvents).not.toHaveBeenCalled();
	});
});

describe('Store.refresh: incremental', () => {
	async function synced() {
		const store = new Store();
		await store.refresh();
		vi.clearAllMocks();
		return store;
	}

	it('costs two requests when nothing changed', async () => {
		const store = await synced();

		expect(await store.refresh()).toBe(true);

		expect(fetchers.syncManifest).toHaveBeenCalledOnce();
		expect(fetchers.pointsManifest).toHaveBeenCalledOnce();
		expect(fetchers.syncEvents).not.toHaveBeenCalled();
		expect(fetchers.syncPlayers).not.toHaveBeenCalled();
		expect(fetchers.pointsSnapshot).not.toHaveBeenCalled();
		expect(store.status.sync?.lastChanges).toMatchObject({ requests: 2, eventsFetched: 0, playersFetched: false });
	});

	it('fetches only new and changed events, and drops removed ones', async () => {
		const store = await synced();
		upstream.events.e1 = { hash: 'h1b', event: event('e1', 'Spring Jam (corrected)') };
		delete upstream.events.e2;
		upstream.events.e3 = { hash: 'h3', event: event('e3', 'Autumn Open') };

		expect(await store.refresh()).toBe(true);

		expect(fetchers.syncEvents).toHaveBeenCalledExactlyOnceWith(['e1', 'e3']);
		const names = [...store.requireIndex().events.values()].map((e) => e.name).sort();
		expect(names).toEqual(['Autumn Open', 'Spring Jam (corrected)']);
		expect(store.requireIndex().results.has('e2-open')).toBe(false);
		expect(store.status.sync?.lastChanges).toMatchObject({ eventsFetched: 2, eventsRemoved: 1 });
	});

	it('treats an event that was requested but not returned as gone', async () => {
		const store = await synced();
		upstream.events.e1 = { hash: 'h1b', event: event('e1', 'Spring Jam') };
		// Changed in the manifest, then stopped being finished before the fetch.
		fetchers.syncEvents.mockResolvedValueOnce({ events: [] });

		expect(await store.refresh()).toBe(true);

		expect(store.requireIndex().events.has('e1')).toBe(false);
		expect(store.status.sync).toMatchObject({ events: 1, lastChanges: { eventsMissing: 1 } });

		// Not stored, so the next sync asks for it again.
		await store.refresh();
		expect(store.requireIndex().events.has('e1')).toBe(true);
	});

	it('refetches players only when their hash changed', async () => {
		const store = await synced();
		upstream.players = [...upstream.players, { id: 'p2', firstName: 'James', lastName: 'Wiseman' }];

		await store.refresh();
		expect(fetchers.syncPlayers).not.toHaveBeenCalled();
		expect(store.status.counts).toMatchObject({ players: 1 });

		upstream.playersHash = 'players-2';
		await store.refresh();
		expect(fetchers.syncPlayers).toHaveBeenCalledOnce();
		expect(store.status.counts).toMatchObject({ players: 2 });
	});

	it("downloads a series' snapshot only when its latest key changed", async () => {
		const store = await synced();
		// Hidden snapshots never count as latest.
		upstream.pointsManifest.h = { key: 'ranking-open_2026-3-1', createdAt: 999, isHidden: true };

		await store.refresh();
		expect(fetchers.pointsSnapshot).not.toHaveBeenCalled();

		upstream.pointsManifest.b = { key: 'ranking-open_2026-2-1', createdAt: 200 };
		await store.refresh();

		expect(fetchers.pointsSnapshot).toHaveBeenCalledExactlyOnceWith('ranking-open_2026-2-1');
		expect(store.requireIndex().rankings.get('ranking-open')!.entries[0]!.points).toBe(20);
		expect(store.status.counts).toMatchObject({ snapshots: 2 });
	});
});

describe('Store.refresh: last good', () => {
	async function synced() {
		const store = new Store();
		await store.refresh();
		vi.clearAllMocks();
		return store;
	}

	it('keeps serving previous data when upstream later goes down', async () => {
		const store = await synced();
		const firstRefreshAt = store.status.lastFullRefreshAt;

		allFail();
		const ok = await store.refresh();

		// A carried-over state must not look like a successful network sync,
		// or a total upstream outage would look healthy.
		expect(ok).toBe(false);
		expect(store.status.origin).toBe('snapshot');
		expect(store.status.lastFullRefreshAt).toBe(firstRefreshAt);
		expect(store.status.counts).toMatchObject({ events: 2, results: 2 });
		expect(saveSnapshot).not.toHaveBeenCalled();
	});

	it('never swaps in a partially fetched sync', async () => {
		const store = await synced();
		upstream.events.e1 = { hash: 'h1b', event: event('e1', 'Spring Jam (corrected)') };
		upstream.playersHash = 'players-2';
		upstream.players = [];
		// Events arrive, then the players call fails: neither may be applied.
		fetchers.syncPlayers.mockRejectedValue(new Error('players down'));

		expect(await store.refresh()).toBe(false);

		expect(store.requireIndex().events.get('e1')!.name).toBe('Spring Jam');
		expect(store.status.counts).toMatchObject({ players: 1 });
		expect(store.status.sources.players.lastError).toContain('players down');

		// The stored hashes did not move, so the next sync retries both.
		fetchers.syncPlayers.mockImplementation(async () => ({ players: upstream.players }));
		expect(await store.refresh()).toBe(true);
		expect(store.requireIndex().events.get('e1')!.name).toBe('Spring Jam (corrected)');
		expect(store.status.counts).toMatchObject({ players: 0 });
	});

	it('discards every batch when one batch fails', async () => {
		const store = await synced();
		for (let i = 0; i < 60; i++) {
			const id = `n${String(i).padStart(2, '0')}`;
			upstream.events[id] = { hash: `n${i}`, event: event(id, `New ${i}`) };
		}
		fetchers.syncEvents
			.mockImplementationOnce(async (ids: string[]) => ({ events: ids.map((id) => upstream.events[id]!.event) }))
			.mockRejectedValueOnce(new Error('rate limited'));

		expect(await store.refresh()).toBe(false);
		expect(store.status.counts).toMatchObject({ events: 2 });
		expect(store.status.sources.events.lastError).toContain('rate limited');
	});

	it('still syncs when the points manifest fails, keeping the standings', async () => {
		const store = await synced();
		fetchers.pointsManifest.mockRejectedValue(new Error('points down'));
		upstream.events.e3 = { hash: 'h3', event: event('e3', 'Autumn Open') };

		expect(await store.refresh()).toBe(true);

		expect(store.status.counts).toMatchObject({ events: 3, rankingSeries: 1, snapshots: 1 });
		expect(store.status.sources.pointsManifest.lastError).toContain('points down');
	});

	it("keeps a series' previous snapshot when its download fails, and retries it", async () => {
		const store = await synced();
		upstream.pointsManifest.b = { key: 'ranking-open_2026-2-1', createdAt: 200 };
		fetchers.pointsSnapshot.mockRejectedValueOnce(new Error('download failed'));

		expect(await store.refresh()).toBe(true);
		expect(store.requireIndex().rankings.get('ranking-open')!.entries[0]!.points).toBe(10);
		expect(store.status.sources.points.lastError).toContain('download failed');

		await store.refresh();
		expect(store.requireIndex().rankings.get('ranking-open')!.entries[0]!.points).toBe(20);
	});

	it('shares one in-flight refresh between concurrent callers', async () => {
		const store = new Store();

		await Promise.all([store.refresh(), store.refresh(), store.refresh()]);

		expect(fetchers.syncManifest).toHaveBeenCalledOnce();
	});

	it('throws a typed error before any data is loaded', () => {
		const store = new Store();
		expect(() => store.requireIndex()).toThrowError(
			expect.objectContaining({ name: 'IndexNotReady' })
		);
	});
});

describe('Store.initialize', () => {
	it('serves the snapshot, then syncs only what changed since it was written', async () => {
		const snapshot: SyncState = {
			fetchedAt: 1,
			formatVersion: 1,
			generatedAt: null,
			events: { e1: { hash: 'h1', event: event('e1', 'Spring Jam') } },
			players: { hash: 'players-1', players: upstream.players },
			pointsManifest: { manifest: { a: { key: 'ranking-open_2026-1-1', createdAt: 100 } } },
			points: {
				'ranking-open': {
					key: 'ranking-open_2026-1-1',
					payload: { data: [{ id: 'p1', fullName: 'Ryan Young', rank: 1, points: 10 }] }
				}
			},
			profiles: null
		};
		vi.mocked(loadSnapshot).mockResolvedValueOnce(snapshot);
		const store = new Store();

		await store.initialize();

		expect(fetchers.syncEvents).toHaveBeenCalledExactlyOnceWith(['e2']);
		expect(fetchers.syncPlayers).not.toHaveBeenCalled();
		expect(fetchers.pointsSnapshot).not.toHaveBeenCalled();
		expect(store.status).toMatchObject({ origin: 'network', counts: { events: 2 } });
	});
});
