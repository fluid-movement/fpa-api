import {
	buildIndex,
	summarizePoolLocks,
	type Corpus,
	type EventLockState
} from '../domain/index-builder.js';
import type { Index } from '../domain/types.js';
import { sources } from '../upstream/sources.js';
import type { RawDirectoryResponse } from '../upstream/types.js';
import { loadSnapshot, saveSnapshot } from './snapshot.js';

export type SourceName =
	| 'players'
	| 'events'
	| 'results'
	| 'manifest'
	| 'points'
	| 'directory'
	| 'judging';

export interface SourceStatus {
	lastSuccessAt: number | null;
	lastErrorAt: number | null;
	lastError: string | null;
}

export interface StoreStatus {
	ready: boolean;
	builtAt: number | null;
	lastFullRefreshAt: number | null;
	lastRefreshDurationMs: number | null;
	refreshing: boolean;
	origin: 'network' | 'snapshot' | null;
	sources: Record<SourceName, SourceStatus>;
	counts: {
		players: number;
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
	#corpus: Corpus | null = null;
	#origin: 'network' | 'snapshot' | null = null;
	#lastFullRefreshAt: number | null = null;
	#lastRefreshDurationMs: number | null = null;
	#refreshing: Promise<boolean> | null = null;

	/** Probe state, used to decide whether a full refresh is actually needed. */
	#lastDirectorySignature: string | null = null;
	#lastManifestSignature: string | null = null;

	/**
	 * Judging data version per event key, so a refresh can skip the ~247 KB
	 * `getEventData` fetch when nothing has moved. Upstream offers no ETag, but
	 * it does offer a 42-byte version endpoint, which amounts to the same thing
	 * for this one payload.
	 */
	readonly #eventDataVersions = new Map<string, string>();

	readonly #sourceStatus: Record<SourceName, SourceStatus> = {
		players: emptyStatus(),
		events: emptyStatus(),
		results: emptyStatus(),
		manifest: emptyStatus(),
		points: emptyStatus(),
		directory: emptyStatus(),
		judging: emptyStatus()
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
		return {
			ready: index !== null,
			builtAt: index?.builtAt ?? null,
			lastFullRefreshAt: this.#lastFullRefreshAt,
			lastRefreshDurationMs: this.#lastRefreshDurationMs,
			refreshing: this.#refreshing !== null,
			origin: this.#origin,
			sources: structuredClone(this.#sourceStatus),
			counts: index
				? {
						players: index.players.size,
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

	/**
	 * Replace the index from an in-memory corpus, bypassing the network.
	 *
	 * Used by tests and for loading a recorded fixture in local development, so
	 * the HTTP layer can be exercised without hitting upstream.
	 */
	hydrate(corpus: Corpus): void {
		this.#corpus = corpus;
		this.#index = buildIndex(corpus);
		this.#origin = 'snapshot';
	}

	/**
	 * Boot: serve from the on-disk snapshot immediately if one exists, then
	 * refresh from the network in the background. This keeps startup fast and
	 * makes an upstream outage at boot survivable.
	 */
	async initialize(): Promise<void> {
		const snapshot = await loadSnapshot();
		if (snapshot) {
			this.#corpus = snapshot;
			this.#index = buildIndex(snapshot);
			this.#origin = 'snapshot';
			console.log(
				`[store] restored snapshot from ${new Date(snapshot.fetchedAt).toISOString()} ` +
					`(${this.#index.results.size} results, ${this.#index.players.size} players)`
			);
		}

		const ok = await this.refresh();
		if (!ok && !this.#index) {
			console.error('[store] no snapshot and initial refresh failed — serving 503 until recovery');
		}
	}

	/**
	 * Full corpus refresh. Concurrent calls share one in-flight operation rather
	 * than stampeding upstream.
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

		// Fetch in parallel but tolerate individual failures, so one flaky
		// service does not block a refresh of the other four.
		const [players, events, results, manifest, points, directory] = await Promise.all([
			sources.players().then(
				(v) => (this.#record('players', null), v),
				(e) => (this.#record('players', e), null)
			),
			sources.events().then(
				(v) => (this.#record('events', null), v),
				(e) => (this.#record('events', e), null)
			),
			sources.results().then(
				(v) => (this.#record('results', null), v),
				(e) => (this.#record('results', e), null)
			),
			sources.manifest().then(
				(v) => (this.#record('manifest', null), v),
				(e) => (this.#record('manifest', e), null)
			),
			sources.latestPoints().then(
				(v) => (this.#record('points', null), v),
				(e) => (this.#record('points', e), null)
			),
			sources.directory().then(
				(v) => (this.#record('directory', null), v),
				(e) => (this.#record('directory', e), null)
			)
		]);

		const previous = this.#corpus;

		// Pool lock state for whatever the judging directory is showing. This
		// runs after the parallel block, not inside it, because the directory
		// is what names the keys to fetch.
		const liveLocks = await this.#fetchLiveLocks(
			directory ?? previous?.directory ?? null,
			previous?.liveLocks
		);

		// The three core sources must be present, either freshly fetched or
		// carried over. Without them we would build a hollow index and serve
		// "no results found" as if it were the truth.
		const nextPlayers = players ?? previous?.players;
		const nextEvents = events ?? previous?.events;
		const nextResults = results ?? previous?.results;

		if (!nextPlayers || !nextEvents || !nextResults) {
			console.error('[store] refresh failed: core sources unavailable and no prior data');
			this.#lastRefreshDurationMs = Date.now() - startedAt;
			return false;
		}

		// Whether this refresh actually retrieved the core data, as opposed to
		// carrying forward what we already had. Everything below depends on
		// this distinction: reporting a carried-over corpus as a successful
		// network refresh would make a total upstream outage look healthy, and
		// silence the very alerts that exist to catch it.
		const coreFetched = players !== null && events !== null && results !== null;

		const corpus: Corpus = {
			// Only advance fetchedAt when data really was fetched, so the
			// snapshot on disk keeps an honest age.
			fetchedAt: coreFetched ? Date.now() : (previous?.fetchedAt ?? Date.now()),
			players: nextPlayers,
			events: nextEvents,
			results: nextResults,
			manifest: manifest ?? previous?.manifest ?? {},
			points: points ?? previous?.points ?? {},
			directory: directory ?? previous?.directory ?? null,
			liveLocks
		};

		try {
			const index = buildIndex(corpus);
			this.#corpus = corpus;
			this.#index = index;
			this.#lastDirectorySignature = this.#signDirectory(
				corpus.directory,
				this.#cachedEventDataVersions(corpus.directory)
			);
			this.#lastManifestSignature = signatureOf(manifest);

			if (coreFetched) {
				this.#origin = 'network';
				this.#lastFullRefreshAt = corpus.fetchedAt;

				await saveSnapshot(corpus).catch((error) => {
					console.warn(`[store] snapshot write failed: ${String(error)}`);
				});
			} else {
				// Serving carried-over data. Leave lastFullRefreshAt where it
				// was so staleness stays visible, and do not rewrite the
				// snapshot with data we did not just fetch.
				this.#origin = 'snapshot';
			}

			this.#lastRefreshDurationMs = Date.now() - startedAt;
			console.log(
				coreFetched
					? `[store] refreshed in ${this.#lastRefreshDurationMs}ms — ` +
							`${index.players.size} players, ${index.events.size} events, ` +
							`${index.results.size} results, ${index.warnings.length} warning(s)`
					: `[store] refresh incomplete after ${this.#lastRefreshDurationMs}ms — ` +
							`core sources unavailable, still serving data from ` +
							`${new Date(corpus.fetchedAt).toISOString()}`
			);
			return coreFetched;
		} catch (error) {
			// A build failure means our normalization hit something unexpected.
			// Keep the previous index rather than swapping in a broken one.
			console.error(`[store] index build failed, keeping previous index: ${String(error)}`);
			this.#lastRefreshDurationMs = Date.now() - startedAt;
			return false;
		}
	}

	/**
	 * Read per-pool `isLocked` state for every event the judging directory is
	 * showing. That is the only upstream signal for "this event has finished"
	 * — directory presence is not, because `showInDirectory` is cleared by a
	 * manual admin call and routinely stays true for weeks afterwards.
	 *
	 * The payload is ~247 KB, so each key is version-probed first (42 bytes)
	 * and only refetched when it moved. A failure carries the previous
	 * observation forward rather than dropping to unknown: the normalizer
	 * treats unknown conservatively, and a judging outage should not change
	 * what we serve for events that already finished.
	 */
	async #fetchLiveLocks(
		directory: RawDirectoryResponse | null,
		previous: Record<string, EventLockState> | undefined
	): Promise<Record<string, EventLockState> | undefined> {
		const keys = (directory?.eventDirectory ?? [])
			.map((entry) => entry.eventKey)
			.filter((key): key is string => typeof key === 'string' && key.length > 0);

		// Forget events that have dropped out of the directory, so the map does
		// not accumulate stale entries across refreshes.
		for (const key of [...this.#eventDataVersions.keys()]) {
			if (!keys.includes(key)) this.#eventDataVersions.delete(key);
		}

		if (keys.length === 0) return undefined;

		const locks: Record<string, EventLockState> = {};
		let failed: unknown = null;

		await Promise.all(
			keys.map(async (key) => {
				const carried = previous?.[key];
				try {
					const version = signatureOf(await sources.eventDataVersion(key));
					if (carried && version !== null && this.#eventDataVersions.get(key) === version) {
						locks[key] = carried;
						return;
					}

					locks[key] = summarizePoolLocks(await sources.eventData(key));
					if (version !== null) this.#eventDataVersions.set(key, version);
				} catch (error) {
					failed = error;
					// Force a real fetch next time rather than trusting a
					// version we may not have successfully paired with data.
					this.#eventDataVersions.delete(key);
					if (carried) locks[key] = carried;
				}
			})
		);

		this.#record('judging', failed);
		return Object.keys(locks).length > 0 ? locks : undefined;
	}

	/**
	 * Cheap probes. 135 bytes and 16 KB respectively — these run frequently and
	 * only escalate to a full refresh when something actually changed.
	 */
	async probeDirectory(): Promise<boolean> {
		try {
			const directory = await sources.directory();
			this.#record('directory', null);

			// Locking a pool bumps the event's minorVersion but leaves the
			// directory payload untouched, so the directory JSON alone cannot
			// see an event finish. Fold the per-event version probes (42 bytes
			// each) into the signature, or a finished event would keep being
			// withheld until the next hourly full refresh.
			const signature = this.#signDirectory(
				directory,
				await this.#probeEventDataVersions(directory)
			);
			if (signature === this.#lastDirectorySignature) return false;

			console.log('[store] directory changed, triggering refresh');
			this.#lastDirectorySignature = signature;
			await this.refresh();
			return true;
		} catch (error) {
			this.#record('directory', error);
			return false;
		}
	}

	/**
	 * The directory's change signature. A refresh and a probe must compute this
	 * identically, or every probe after a refresh reports a spurious change.
	 */
	#signDirectory(
		directory: RawDirectoryResponse | null,
		versions: Record<string, string | null>
	): string | null {
		// Sorted: the probe fills `versions` in promise-completion order, and
		// an unstable key order would serialize differently each time and look
		// like a change on every poll.
		const sorted = Object.keys(versions)
			.sort()
			.map((key) => [key, versions[key]]);
		return signatureOf({ directory, versions: sorted });
	}

	/** The versions we already hold, with no upstream call. */
	#cachedEventDataVersions(
		directory: RawDirectoryResponse | null
	): Record<string, string | null> {
		const versions: Record<string, string | null> = {};
		for (const entry of directory?.eventDirectory ?? []) {
			if (!entry.eventKey) continue;
			versions[entry.eventKey] = this.#eventDataVersions.get(entry.eventKey) ?? null;
		}
		return versions;
	}

	/**
	 * Version probe for every directoried event. Returns null for any key that
	 * failed, which keeps a transient error from looking like a version change
	 * and stampeding a full refresh — the next probe retries it anyway.
	 */
	async #probeEventDataVersions(
		directory: RawDirectoryResponse
	): Promise<Record<string, string | null>> {
		const keys = (directory.eventDirectory ?? [])
			.map((entry) => entry.eventKey)
			.filter((key): key is string => typeof key === 'string' && key.length > 0)
			.sort();

		const versions: Record<string, string | null> = {};
		await Promise.all(
			keys.map(async (key) => {
				try {
					versions[key] = signatureOf(await sources.eventDataVersion(key));
				} catch {
					versions[key] = this.#eventDataVersions.get(key) ?? null;
				}
			})
		);
		return versions;
	}

	async probeManifest(): Promise<boolean> {
		try {
			const manifest = await sources.manifest();
			this.#record('manifest', null);
			const signature = signatureOf(manifest);
			if (signature === this.#lastManifestSignature) return false;

			console.log('[store] rankings manifest changed, triggering refresh');
			this.#lastManifestSignature = signature;
			await this.refresh();
			return true;
		} catch (error) {
			this.#record('manifest', error);
			return false;
		}
	}
}

function signatureOf(value: unknown): string | null {
	if (value == null) return null;
	return JSON.stringify(value);
}

export const store = new Store();
