import { buildIndex, type Corpus } from '../domain/index-builder.js';
import type { Index } from '../domain/types.js';
import { config } from '../config.js';
import { adaptPointsManifest, latestSnapshotKeys } from '../upstream/adapter.js';
import { SYNC_EVENTS_BATCH_SIZE, sources } from '../upstream/sources.js';
import type { RawManifestResponse, SyncEvent } from '../upstream/types.js';
import { loadSnapshot, saveSnapshot } from './snapshot.js';
import {
	batches,
	isEmptyPlan,
	mergeEvents,
	planSync,
	toCorpus,
	validateManifest,
	type SyncState
} from './sync.js';

export type SourceName =
	| 'syncManifest'
	| 'events'
	| 'players'
	| 'pointsManifest'
	| 'points'
	| 'profiles';

export interface SourceStatus {
	lastSuccessAt: number | null;
	lastErrorAt: number | null;
	lastError: string | null;
}

/** What the last successful sync changed, and what it cost upstream. */
export interface SyncChanges {
	at: number;
	/** Upstream requests the sync made, manifests included. */
	requests: number;
	eventsFetched: number;
	eventsRemoved: number;
	/** Requested but not returned: they left the finished set mid-sync. */
	eventsMissing: number;
	playersFetched: boolean;
	pointsFetched: string[];
	pointsRemoved: string[];
}

export interface StoreStatus {
	ready: boolean;
	builtAt: number | null;
	/** When the sync API was last read successfully. */
	lastFullRefreshAt: number | null;
	lastRefreshDurationMs: number | null;
	refreshing: boolean;
	origin: 'network' | 'snapshot' | null;
	sources: Record<SourceName, SourceStatus>;
	sync: {
		formatVersion: number;
		/** The sync manifest's `generatedAt` for the data being served. */
		generatedAt: string | null;
		events: number;
		playersHash: string;
		/** Latest snapshot key per series behind the current standings. */
		pointsKeys: Record<string, string>;
		lastChanges: SyncChanges | null;
	} | null;
	counts: {
		players: number;
		hiddenPlayers: number;
		events: number;
		results: number;
		rankingSeries: number;
		snapshots: number;
	} | null;
	warnings: string[];
}

function emptyStatus(): SourceStatus {
	return { lastSuccessAt: null, lastErrorAt: null, lastError: null };
}

/**
 * Holds the current read model and owns all refresh logic.
 *
 * Two invariants:
 *   1. The index is replaced atomically. A request either sees the whole old
 *      index or the whole new one, never a partially-rebuilt mix.
 *   2. A failed refresh never destroys good data. If upstream returns garbage
 *      or nothing, we keep serving what we have and record the error.
 */
export class Store {
	#index: Index | null = null;
	#state: SyncState | null = null;
	#origin: 'network' | 'snapshot' | null = null;
	#lastFullRefreshAt: number | null = null;
	#lastRefreshDurationMs: number | null = null;
	#lastChanges: SyncChanges | null = null;
	#refreshing: Promise<boolean> | null = null;

	readonly #sourceStatus: Record<SourceName, SourceStatus> = {
		syncManifest: emptyStatus(),
		events: emptyStatus(),
		players: emptyStatus(),
		pointsManifest: emptyStatus(),
		points: emptyStatus(),
		// Stays empty while PROFILES_URL is unset: the source is disabled.
		profiles: emptyStatus()
	};

	get index(): Index | null {
		return this.#index;
	}

	/** Throws a typed error when called before the first successful load. */
	requireIndex(): Index {
		if (!this.#index) {
			const error = new Error('Index is not ready yet');
			error.name = 'IndexNotReady';
			throw error;
		}
		return this.#index;
	}

	get status(): StoreStatus {
		const index = this.#index;
		const state = this.#state;
		return {
			ready: index !== null,
			builtAt: index?.builtAt ?? null,
			lastFullRefreshAt: this.#lastFullRefreshAt,
			lastRefreshDurationMs: this.#lastRefreshDurationMs,
			refreshing: this.#refreshing !== null,
			origin: this.#origin,
			sources: structuredClone(this.#sourceStatus),
			sync: state
				? {
						formatVersion: state.formatVersion,
						generatedAt: state.generatedAt,
						events: Object.keys(state.events).length,
						playersHash: state.players.hash,
						pointsKeys: Object.fromEntries(
							Object.entries(state.points).map(([series, { key }]) => [series, key])
						),
						lastChanges: this.#lastChanges ? structuredClone(this.#lastChanges) : null
					}
				: null,
			counts: index
				? {
						players: index.players.size - index.hiddenPlayerIds.size,
						hiddenPlayers: index.hiddenPlayerIds.size,
						events: index.events.size,
						results: index.results.size,
						rankingSeries: index.rankings.size,
						snapshots: index.snapshots.length
					}
				: null,
			warnings: index?.warnings ?? []
		};
	}

	#record(source: SourceName, error: unknown): void {
		const status = this.#sourceStatus[source];
		if (error) {
			status.lastErrorAt = Date.now();
			status.lastError = error instanceof Error ? error.message : String(error);
		} else {
			status.lastSuccessAt = Date.now();
			status.lastError = null;
		}
	}

	/** Run one upstream call, recording its outcome; null on failure. */
	async #call<T>(source: SourceName, request: () => Promise<T>): Promise<T | null> {
		try {
			const value = await request();
			this.#record(source, null);
			return value;
		} catch (error) {
			this.#record(source, error);
			return null;
		}
	}

	/**
	 * Replace the index from an in-memory corpus, bypassing the network.
	 *
	 * Used by tests and for loading a recorded fixture in local development, so
	 * the HTTP layer can be exercised without hitting upstream. Holds no sync
	 * state, so the next refresh is a full sync.
	 */
	hydrate(corpus: Corpus): void {
		this.#state = null;
		this.#index = buildIndex(corpus);
		this.#origin = 'snapshot';
	}

	/**
	 * Boot: serve from the on-disk snapshot immediately if one exists, then
	 * sync from the network in the background. The snapshot's hashes make that
	 * first sync incremental. This keeps startup fast and makes an upstream
	 * outage at boot survivable.
	 */
	async initialize(): Promise<void> {
		const snapshot = await loadSnapshot();
		if (snapshot) {
			try {
				this.#index = buildIndex(toCorpus(snapshot));
				this.#state = snapshot;
				this.#origin = 'snapshot';
				console.log(
					`[store] restored snapshot from ${new Date(snapshot.fetchedAt).toISOString()} ` +
						`(${this.#index.results.size} results, ${this.#index.players.size} players)`
				);
			} catch (error) {
				console.warn(`[store] snapshot could not be indexed, ignoring it: ${String(error)}`);
			}
		}

		const ok = await this.refresh();
		if (!ok && !this.#index) {
			console.error('[store] no snapshot and initial sync failed — serving 503 until recovery');
		}
	}

	/**
	 * Sync from upstream. Concurrent calls share one in-flight operation rather
	 * than stampeding upstream. Resolves true when the sync API was read
	 * successfully, false when the previous data is still being served.
	 */
	refresh(): Promise<boolean> {
		if (this.#refreshing) return this.#refreshing;
		this.#refreshing = this.#doRefresh().finally(() => {
			this.#refreshing = null;
		});
		return this.#refreshing;
	}

	async #doRefresh(): Promise<boolean> {
		const startedAt = Date.now();
		const previous = this.#state;
		let requests = 0;
		const count = <T>(promise: Promise<T>): Promise<T> => {
			requests++;
			return promise;
		};

		// The two manifests decide everything else. Profiles are independent.
		const [syncManifest, pointsManifestRaw, profiles] = await Promise.all([
			this.#call('syncManifest', () => count(sources.syncManifest()).then(validateManifest)),
			this.#call('pointsManifest', () => count(sources.pointsManifest())),
			config.profilesUrl
				? this.#call('profiles', () => count(sources.profiles()))
				: Promise.resolve(null)
		]);

		let pointsManifest: RawManifestResponse | null = null;
		let latestKeys: Record<string, string> | null = null;
		if (pointsManifestRaw) {
			pointsManifest = adaptPointsManifest(pointsManifestRaw);
			latestKeys = latestSnapshotKeys(pointsManifest);
		}

		// Without a sync manifest, plan against what is stored: only the points
		// part of the plan can do anything then.
		const plan = planSync(previous, syncManifest ?? storedManifest(previous), latestKeys);

		// ── Sync API: all or nothing ─────────────────────────────────────────
		// Events and players are fetched in full before anything is swapped in.
		// If any call fails, everything this sync fetched from the sync API is
		// discarded and the previous events and players stay; the next sync
		// retries, since their stored hashes did not move.
		let synced: Pick<SyncState, 'events' | 'players' | 'formatVersion' | 'generatedAt'> | null = null;
		let missing: string[] = [];

		if (syncManifest) {
			const fetched = await this.#fetchEvents(plan.fetchEvents, count);
			const players = fetched && plan.fetchPlayers ? await this.#fetchPlayers(count) : null;

			if (fetched && (!plan.fetchPlayers || players)) {
				const merged = mergeEvents(previous?.events ?? {}, plan, syncManifest.events, fetched);
				missing = merged.missing;
				if (players && syncManifest.players.count !== null && players.length !== syncManifest.players.count) {
					console.warn(
						`[store] sync/players returned ${players.length} players, manifest says ${syncManifest.players.count}`
					);
				}
				synced = {
					events: merged.events,
					players: players
						? { hash: syncManifest.players.hash, players }
						: previous!.players,
					formatVersion: syncManifest.formatVersion,
					generatedAt: syncManifest.generatedAt
				};
			}
		}

		if (!synced && !previous) {
			console.error('[store] sync failed and there is no prior data');
			this.#lastRefreshDurationMs = Date.now() - startedAt;
			return false;
		}

		// ── Points: per series ───────────────────────────────────────────────
		// Independent of the sync API. A series whose download fails keeps its
		// previous snapshot (and key, so the next sync retries it).
		const points = { ...(previous?.points ?? {}) };
		for (const series of plan.removePoints) delete points[series];
		const pointsFetched: string[] = [];
		const downloads = Object.entries(plan.fetchPoints);
		if (downloads.length > 0) {
			let failure: unknown = null;
			await Promise.all(
				downloads.map(async ([series, key]) => {
					try {
						const payload = await count(sources.pointsSnapshot(key));
						points[series] = { key, payload };
						pointsFetched.push(series);
					} catch (error) {
						failure = error;
					}
				})
			);
			this.#record('points', failure);
		}

		const state: SyncState = {
			// Only advance fetchedAt when the sync API really was read, so the
			// snapshot on disk keeps an honest age.
			fetchedAt: synced ? Date.now() : previous!.fetchedAt,
			formatVersion: (synced ?? previous!).formatVersion,
			generatedAt: (synced ?? previous!).generatedAt,
			events: (synced ?? previous!).events,
			players: (synced ?? previous!).players,
			pointsManifest: pointsManifest ?? previous?.pointsManifest ?? {},
			points,
			// Disabling the source drops the profiles rather than serving a
			// stale copy forever.
			profiles: config.profilesUrl ? (profiles ?? previous?.profiles ?? null) : null
		};

		let index: Index;
		try {
			index = buildIndex(toCorpus(state));
		} catch (error) {
			// A build failure means our normalization hit something unexpected.
			// Keep the previous index rather than swapping in a broken one.
			console.error(`[store] index build failed, keeping previous index: ${String(error)}`);
			this.#lastRefreshDurationMs = Date.now() - startedAt;
			return false;
		}

		this.#state = state;
		this.#index = index;
		this.#lastRefreshDurationMs = Date.now() - startedAt;

		if (synced) {
			this.#origin = 'network';
			this.#lastFullRefreshAt = state.fetchedAt;
			this.#lastChanges = {
				at: state.fetchedAt,
				requests,
				eventsFetched: plan.fetchEvents.length - missing.length,
				eventsRemoved: plan.removeEvents.length,
				eventsMissing: missing.length,
				playersFetched: plan.fetchPlayers,
				pointsFetched: pointsFetched.sort(),
				pointsRemoved: plan.removePoints
			};

			await saveSnapshot(state).catch((error) => {
				console.warn(`[store] snapshot write failed: ${String(error)}`);
			});

			console.log(
				isEmptyPlan(plan)
					? `[store] synced in ${this.#lastRefreshDurationMs}ms — no changes (${requests} requests)`
					: `[store] synced in ${this.#lastRefreshDurationMs}ms (${requests} requests) — ` +
							`${this.#lastChanges.eventsFetched} event(s) fetched, ` +
							`${this.#lastChanges.eventsRemoved} removed, ` +
							`players ${plan.fetchPlayers ? 'refetched' : 'unchanged'}, ` +
							`${pointsFetched.length} points series fetched — ` +
							`${index.players.size} players, ${index.events.size} events, ` +
							`${index.results.size} results, ${index.warnings.length} warning(s)`
			);
			return true;
		}

		// Serving carried-over sync data. Leave lastFullRefreshAt where it was so
		// staleness stays visible, and do not rewrite the snapshot with data we
		// did not just fetch.
		this.#origin = 'snapshot';
		console.log(
			`[store] sync incomplete after ${this.#lastRefreshDurationMs}ms — ` +
				`still serving data from ${new Date(state.fetchedAt).toISOString()}`
		);
		return false;
	}

	/**
	 * Fetch events in batches of at most 50, one batch at a time to stay light
	 * on upstream. Null when any batch failed: a partial set is never used.
	 */
	async #fetchEvents(
		ids: string[],
		count: <T>(promise: Promise<T>) => Promise<T>
	): Promise<SyncEvent[] | null> {
		const fetched: SyncEvent[] = [];
		for (const batch of batches(ids, SYNC_EVENTS_BATCH_SIZE)) {
			const response = await this.#call('events', () => count(sources.syncEvents(batch)));
			if (!response) return null;
			if (!Array.isArray(response.events)) {
				this.#record('events', new Error('sync/events answered without an events array'));
				return null;
			}
			fetched.push(...response.events);
		}
		return fetched;
	}

	async #fetchPlayers(
		count: <T>(promise: Promise<T>) => Promise<T>
	): Promise<NonNullable<SyncState['players']['players']> | null> {
		const response = await this.#call('players', () => count(sources.syncPlayers()));
		if (!response) return null;
		if (!Array.isArray(response.players)) {
			this.#record('players', new Error('sync/players answered without a players array'));
			return null;
		}
		return response.players;
	}
}

/** The manifest a stored state was synced under, to plan against when the live one is unavailable. */
function storedManifest(state: SyncState | null): {
	events: Record<string, string>;
	players: { hash: string };
} {
	if (!state) return { events: {}, players: { hash: '' } };
	return {
		events: Object.fromEntries(Object.entries(state.events).map(([id, { hash }]) => [id, hash])),
		players: { hash: state.players.hash }
	};
}

export const store = new Store();
