import { type Corpus } from '../domain/index-builder.js';
import type { Index } from '../domain/types.js';
export type SourceName = 'players' | 'events' | 'results' | 'manifest' | 'points' | 'directory' | 'judging';
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
/**
 * Holds the current read model and owns all refresh logic.
 *
 * Two invariants:
 *   1. The index is replaced atomically. A request either sees the whole old
 *      index or the whole new one, never a partially-rebuilt mix.
 *   2. A failed refresh never destroys good data. If upstream returns garbage
 *      or nothing, we keep serving what we have and record the error.
 */
export declare class Store {
    #private;
    get index(): Index | null;
    /** Throws a typed error when called before the first successful load. */
    requireIndex(): Index;
    get status(): StoreStatus;
    /**
     * Replace the index from an in-memory corpus, bypassing the network.
     *
     * Used by tests and for loading a recorded fixture in local development, so
     * the HTTP layer can be exercised without hitting upstream.
     */
    hydrate(corpus: Corpus): void;
    /**
     * Boot: serve from the on-disk snapshot immediately if one exists, then
     * refresh from the network in the background. This keeps startup fast and
     * makes an upstream outage at boot survivable.
     */
    initialize(): Promise<void>;
    /**
     * Full corpus refresh. Concurrent calls share one in-flight operation rather
     * than stampeding upstream.
     */
    refresh(): Promise<boolean>;
    /**
     * Cheap probes. 135 bytes and 16 KB respectively — these run frequently and
     * only escalate to a full refresh when something actually changed.
     */
    probeDirectory(): Promise<boolean>;
    probeManifest(): Promise<boolean>;
}
export declare const store: Store;
