import { buildIndex, type Corpus } from '../domain/index-builder.js';
import type { Index } from '../domain/types.js';
import { sources } from '../upstream/sources.js';
import { loadSnapshot, saveSnapshot } from './snapshot.js';

export type SourceName = 'players' | 'events' | 'results' | 'manifest' | 'points' | 'directory';

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

	readonly #sourceStatus: Record<SourceName, SourceStatus> = {
		players: emptyStatus(),
		events: emptyStatus(),
		results: emptyStatus(),
		manifest: emptyStatus(),
		points: emptyStatus(),
		directory: emptyStatus()
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

		const corpus: Corpus = {
			fetchedAt: Date.now(),
			players: nextPlayers,
			events: nextEvents,
			results: nextResults,
			manifest: manifest ?? previous?.manifest ?? {},
			points: points ?? previous?.points ?? {},
			directory: directory ?? previous?.directory ?? null
		};

		try {
			const index = buildIndex(corpus);
			this.#corpus = corpus;
			this.#index = index;
			this.#origin = 'network';
			this.#lastFullRefreshAt = corpus.fetchedAt;
			this.#lastDirectorySignature = signatureOf(directory);
			this.#lastManifestSignature = signatureOf(manifest);

			await saveSnapshot(corpus).catch((error) => {
				console.warn(`[store] snapshot write failed: ${String(error)}`);
			});

			this.#lastRefreshDurationMs = Date.now() - startedAt;
			console.log(
				`[store] refreshed in ${this.#lastRefreshDurationMs}ms — ` +
					`${index.players.size} players, ${index.events.size} events, ` +
					`${index.results.size} results, ${index.warnings.length} warning(s)`
			);
			return true;
		} catch (error) {
			// A build failure means our normalization hit something unexpected.
			// Keep the previous index rather than swapping in a broken one.
			console.error(`[store] index build failed, keeping previous index: ${String(error)}`);
			this.#lastRefreshDurationMs = Date.now() - startedAt;
			return false;
		}
	}

	/**
	 * Cheap probes. 135 bytes and 16 KB respectively — these run frequently and
	 * only escalate to a full refresh when something actually changed.
	 */
	async probeDirectory(): Promise<boolean> {
		try {
			const directory = await sources.directory();
			this.#record('directory', null);
			const signature = signatureOf(directory);
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
