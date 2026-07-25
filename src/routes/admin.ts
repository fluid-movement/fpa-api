import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { config } from '../config.js';
import { httpError } from '../lib/http.js';
import { ErrorSchema } from '../schemas/domain.js';
import { store } from '../store/store.js';

export const admin = new OpenAPIHono();

const SourceStatusSchema = z
	.object({
		lastSuccessAt: z.number().nullable(),
		lastErrorAt: z.number().nullable(),
		lastError: z.string().nullable()
	})
	.openapi('SourceStatus');

const StatusSchema = z
	.object({
		ready: z.boolean().describe('False until the first successful load'),
		builtAt: z.number().nullable().describe('When the in-memory index was built'),
		lastFullRefreshAt: z.number().nullable(),
		lastRefreshDurationMs: z.number().nullable(),
		refreshing: z.boolean(),
		origin: z.enum(['network', 'snapshot']).nullable().describe('Where the current data came from'),
		sources: z.record(z.string(), SourceStatusSchema).describe('Per-upstream-service health'),
		counts: z
			.object({
				players: z.number(),
				events: z.number(),
				results: z.number(),
				rankingSeries: z.number(),
				snapshots: z.number()
			})
			.nullable(),
		warnings: z.array(z.string()).describe('Non-fatal data problems found while normalizing')
	})
	.openapi('Status');

const healthRoute = createRoute({
	method: 'get',
	path: '/health',
	tags: ['Operations'],
	summary: 'Service health and data freshness',
	description:
		'Reports per-source upstream health, when data was last refreshed, and any data-quality ' +
		'warnings. Returns 503 while the index is not yet ready, but the body is identical either ' +
		'way — this is the endpoint to read when something looks wrong.',
	responses: {
		200: { description: 'Healthy', content: { 'application/json': { schema: StatusSchema } } },
		503: {
			description: 'Not ready — no data loaded yet',
			content: { 'application/json': { schema: StatusSchema } }
		}
	}
});

admin.openapi(healthRoute, (c) => {
	const status = store.status;
	return c.json(status, status.ready ? 200 : 503);
});

const refreshRoute = createRoute({
	method: 'post',
	path: '/refresh',
	tags: ['Operations'],
	summary: 'Force an immediate full refresh',
	description:
		'Pulls the full corpus now instead of waiting for the scheduled refresh. Intended to be ' +
		'called right after results are entered upstream. Requires a bearer token matching ' +
		'REFRESH_TOKEN; when that variable is unset the route is disabled rather than left open.',
	security: [{ bearerAuth: [] }],
	responses: {
		200: {
			description: 'Refresh completed',
			content: {
				'application/json': {
					schema: z.object({ refreshed: z.boolean(), status: StatusSchema }).openapi('RefreshResult')
				}
			}
		},
		401: { description: 'Invalid or missing token', content: { 'application/json': { schema: ErrorSchema } } },
		503: {
			description: 'Refresh failed, or the endpoint is disabled',
			content: { 'application/json': { schema: ErrorSchema } }
		}
	}
});

admin.openapi(refreshRoute, async (c) => {
	if (!config.refreshToken) {
		throw httpError(503, 'Refresh endpoint is disabled: REFRESH_TOKEN is not configured');
	}

	const provided = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
	if (provided !== config.refreshToken) {
		throw httpError(401, 'Invalid or missing refresh token');
	}

	const ok = await store.refresh();
	if (!ok) {
		// The previous index is still being served; GET /health has the detail.
		throw httpError(503, 'Refresh failed — upstream unavailable. See GET /health for per-source status.');
	}

	return c.json({ refreshed: true, status: store.status }, 200);
});

/** Liveness only. Deliberately not in the spec and never dependent on upstream. */
admin.get('/healthz', (c) => c.text('ok'));
