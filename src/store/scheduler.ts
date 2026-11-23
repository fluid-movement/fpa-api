import { config } from '../config.js';
import type { Store } from './store.js';

/**
 * Sync scheduler.
 *
 * One interval. A sync reads two small manifests and fetches only what they
 * say is new or changed, so a quiet hour costs two requests. `POST /refresh`
 * forces a sync between ticks.
 */
export function startScheduler(store: Store): () => void {
	const timer = setInterval(() => {
		store.refresh().catch((error) => {
			console.warn(`[scheduler] sync failed: ${String(error)}`);
		});
	}, config.syncIntervalMs);
	// Never keep the process alive purely to run a timer.
	timer.unref();

	console.log(`[scheduler] sync every ${config.syncIntervalMs}ms`);

	return () => clearInterval(timer);
}
