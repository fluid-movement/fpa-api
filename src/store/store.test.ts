import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchers = {
	players: vi.fn(),
	events: vi.fn(),
	results: vi.fn(),
	manifest: vi.fn(),
	latestPoints: vi.fn(),
	directory: vi.fn(),
	eventDataVersion: vi.fn(),
	eventData: vi.fn()
};

vi.mock('../upstream/sources.js', () => ({ sources: fetchers }));
vi.mock('./snapshot.js', () => ({
	loadSnapshot: vi.fn(async () => null),
	saveSnapshot: vi.fn(async () => {})
}));

const { Store } = await import('./store.js');
const { saveSnapshot } = await import('./snapshot.js');

const PLAYERS = { players: { p1: { key: 'p1', firstName: 'Ryan', lastName: 'Young' } } };
const EVENTS = { allEventSummaryData: { e1: { key: 'e1', eventName: 'Test', startDate: '2026-05-01' } } };
const RESULTS = {
	results: {
		r1: {
			key: 'r1',
			eventId: 'e1',
			eventName: 'Test',
			divisionName: 'Open Pairs',
			resultsData: {
				round1: { poolA: { poolId: 'A', teamData: [{ players: ['p1'], place: 1, points: 1 }] } }
			}
		}
	}
};

/** One directoried event, as `getEventDirectory` returns it. */
const DIRECTORY = { eventDirectory: [{ eventKey: 'e1', eventName: 'Test', modifiedAt: 1 }] };

/** `getEventData` shape — note the doubled `eventData` nesting is upstream's. */
function lockedEventData(isLocked: boolean) {
	return {
		eventData: {
			key: 'e1',
			eventData: { poolMap: { 'pool|e1|Open Pairs|Finals|A': { isLocked } } }
		}
	};
}

function allSucceed() {
	fetchers.players.mockResolvedValue(PLAYERS);
	fetchers.events.mockResolvedValue(EVENTS);
	fetchers.results.mockResolvedValue(RESULTS);
	fetchers.manifest.mockResolvedValue({});
	fetchers.latestPoints.mockResolvedValue({});
	fetchers.directory.mockResolvedValue({ eventDirectory: [] });
	fetchers.eventDataVersion.mockResolvedValue({ importantVersion: 1, minorVersion: 1 });
	fetchers.eventData.mockResolvedValue(lockedEventData(true));
}

function allFail() {
	const boom = () => Promise.reject(new Error('upstream down'));
	for (const fetcher of Object.values(fetchers)) fetcher.mockImplementation(boom);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('Store.refresh', () => {
	it('builds an index and reports a network origin on success', async () => {
		allSucceed();
		const store = new Store();

		expect(await store.refresh()).toBe(true);
		expect(store.status).toMatchObject({ ready: true, origin: 'network' });
		expect(store.status.counts).toMatchObject({ players: 1, events: 1, results: 1 });
		expect(store.status.lastFullRefreshAt).not.toBeNull();
		expect(saveSnapshot).toHaveBeenCalledOnce();
	});

	it('fails cleanly when there is no data and no prior corpus', async () => {
		allFail();
		const store = new Store();

		expect(await store.refresh()).toBe(false);
		expect(store.status.ready).toBe(false);
		expect(store.status.sources.results.lastError).toContain('upstream down');
	});

	it('keeps serving previous data when upstream later goes down', async () => {
		allSucceed();
		const store = new Store();
		await store.refresh();
		const firstRefreshAt = store.status.lastFullRefreshAt;

		allFail();
		const ok = await store.refresh();

		// Regression: a carried-over corpus used to be reported as a successful
		// network refresh with an advancing lastFullRefreshAt, which made a
		// total upstream outage look perfectly healthy and silenced both
		// documented staleness alerts.
		expect(ok).toBe(false);
		expect(store.status.origin).toBe('snapshot');
		expect(store.status.lastFullRefreshAt).toBe(firstRefreshAt);
		// Data is still served.
		expect(store.status.counts).toMatchObject({ results: 1 });
		expect(saveSnapshot).toHaveBeenCalledOnce();
	});

	it('tolerates one non-core source failing without losing the refresh', async () => {
		allSucceed();
		fetchers.manifest.mockRejectedValue(new Error('manifest down'));
		const store = new Store();

		expect(await store.refresh()).toBe(true);
		expect(store.status.origin).toBe('network');
		expect(store.status.sources.manifest.lastError).toContain('manifest down');
		expect(store.status.sources.results.lastError).toBeNull();
	});

	it('shares one in-flight refresh between concurrent callers', async () => {
		allSucceed();
		const store = new Store();

		await Promise.all([store.refresh(), store.refresh(), store.refresh()]);

		// Three callers, one upstream fetch each — not three.
		expect(fetchers.results).toHaveBeenCalledOnce();
	});

	it('throws a typed error before any data is loaded', () => {
		const store = new Store();
		expect(() => store.requireIndex()).toThrowError(
			expect.objectContaining({ name: 'IndexNotReady' })
		);
	});
});

describe('Store judging lock state', () => {
	it('skips the 247 KB event data fetch when the version has not moved', async () => {
		allSucceed();
		fetchers.directory.mockResolvedValue(DIRECTORY);
		const store = new Store();

		await store.refresh();
		expect(fetchers.eventData).toHaveBeenCalledOnce();

		await store.refresh();
		// Version unchanged, so the second refresh probes (42 bytes) but does
		// not re-download the blob.
		expect(fetchers.eventData).toHaveBeenCalledOnce();
		expect(fetchers.eventDataVersion).toHaveBeenCalledTimes(2);
	});

	it('refetches event data once the version moves', async () => {
		allSucceed();
		fetchers.directory.mockResolvedValue(DIRECTORY);
		const store = new Store();

		await store.refresh();
		fetchers.eventDataVersion.mockResolvedValue({ importantVersion: 1, minorVersion: 2 });
		await store.refresh();

		expect(fetchers.eventData).toHaveBeenCalledTimes(2);
	});

	it('does not touch the judging endpoints when the directory is empty', async () => {
		allSucceed();
		const store = new Store();

		await store.refresh();

		expect(fetchers.eventDataVersion).not.toHaveBeenCalled();
		expect(fetchers.eventData).not.toHaveBeenCalled();
	});

	it('carries the previous lock state forward when judging fails', async () => {
		// A judging outage must not flip a finished event into "unknown" and
		// get it withheld — that would drop its complete results from the API.
		allSucceed();
		fetchers.directory.mockResolvedValue(DIRECTORY);
		const store = new Store();

		await store.refresh();
		expect(store.status.counts).toMatchObject({ events: 1, results: 1 });

		fetchers.eventData.mockRejectedValue(new Error('judging down'));
		fetchers.eventDataVersion.mockRejectedValue(new Error('judging down'));
		expect(await store.refresh()).toBe(true);

		expect(store.status.sources.judging.lastError).toContain('judging down');
		expect(store.status.counts).toMatchObject({ events: 1, results: 1 });
	});

	it('withholds the event and its results while a pool is unlocked', async () => {
		allSucceed();
		fetchers.directory.mockResolvedValue(DIRECTORY);
		fetchers.eventData.mockResolvedValue(lockedEventData(false));
		const store = new Store();

		await store.refresh();

		expect(store.status.counts).toMatchObject({ events: 0, results: 0 });
		expect(store.status.warnings).toContainEqual(
			expect.stringContaining('is being judged')
		);
	});
});

describe('Store.probeDirectory', () => {
	it('escalates to a refresh when a pool is locked, though the directory is unchanged', async () => {
		// Locking a pool bumps the event's minorVersion but leaves
		// getEventDirectory byte-identical, so signing the directory alone
		// would miss an event finishing until the next hourly full refresh.
		allSucceed();
		fetchers.directory.mockResolvedValue(DIRECTORY);
		fetchers.eventData.mockResolvedValue(lockedEventData(false));
		const store = new Store();

		await store.refresh();
		expect(store.status.counts).toMatchObject({ events: 0 });

		expect(await store.probeDirectory()).toBe(false);

		fetchers.eventDataVersion.mockResolvedValue({ importantVersion: 1, minorVersion: 2 });
		fetchers.eventData.mockResolvedValue(lockedEventData(true));

		expect(await store.probeDirectory()).toBe(true);
		expect(store.status.counts).toMatchObject({ events: 1, results: 1 });
	});
});
