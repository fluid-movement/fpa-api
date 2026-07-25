import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { config } from './config.js';
import { startScheduler } from './store/scheduler.js';
import { store } from './store/store.js';

const app = createApp();

/**
 * Start listening before the first load completes. Routes answer 503 with a
 * Retry-After until the index is ready, which is better than refusing
 * connections and failing a container health check during a slow cold start.
 */
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`[server] listening on http://localhost:${info.port}`);
	console.log(`[server] docs at http://localhost:${info.port}/docs`);
});

const stopScheduler = startScheduler(store);

store.initialize().catch((error) => {
	console.error('[server] initialization failed:', error);
});

function shutdown(signal: string): void {
	console.log(`[server] ${signal} received, shutting down`);
	stopScheduler();
	server.close(() => process.exit(0));
	// Do not hang forever on a stuck connection.
	setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
