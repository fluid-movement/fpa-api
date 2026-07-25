import type { Store } from './store.js';
/**
 * Tiered refresh scheduler.
 *
 * Upstream sets no ETag or Last-Modified, so conditional requests are
 * impossible. Instead: poll the two tiny endpoints often, pull the ~5 MB corpus
 * only when a probe says something changed, with a slow full refresh as a
 * safety net for changes no probe can see (a player being renamed, say).
 *
 * Steady-state upstream cost is roughly 1.5 KB/minute plus one 5 MB fetch/hour,
 * regardless of how much traffic we serve.
 */
export declare function startScheduler(store: Store): () => void;
