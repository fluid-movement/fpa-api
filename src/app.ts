import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { config } from './config.js';
import { admin } from './routes/admin.js';
import { events } from './routes/events.js';
import { match } from './routes/match.js';
import { players } from './routes/players.js';
import { rankings } from './routes/rankings.js';
import { ratings } from './routes/ratings.js';
import { snapshots } from './routes/snapshots.js';

export const OPENAPI_DOC = {
	openapi: '3.1.0',
	info: {
		title: 'FPA Results API',
		version: '0.1.0',
		description: [
			'Read-only API over the freestyle frisbee judging, results and rankings services.',
			'',
			'Upstream is five independent microservices, each with its own store and no shared query',
			'layer. This API fetches all of them, resolves duplicate player identities, normalizes',
			'inconsistent division names, and joins ranking points back to the events that produced',
			'them — then serves the result from an in-memory index.',
			'',
			'**Freshness.** Data is refreshed on a tiered schedule rather than per request, so responses',
			'can be up to an hour behind upstream. `GET /health` reports exactly how stale the data is.',
			'',
			'**Data quality.** Upstream enforces no referential integrity. Records that reference a',
			'missing player or event are kept and flagged (`unknown: true` on a team member, warnings',
			'on `/health`) rather than dropped, so nothing disappears silently.'
		].join('\n')
	},
	tags: [
		{ name: 'Events', description: 'Events and their results' },
		{ name: 'Players', description: 'Player directory and career profiles' },
		{
			name: 'Rankings',
			description: 'Season standings by accumulated tournament points'
		},
		{
			name: 'Ratings',
			description:
				'Elo-style strength estimates. A different measure from rankings, with a different shape.'
		},
		{ name: 'Snapshots', description: 'Historical ranking and rating snapshots over time' },
		{ name: 'Matching', description: 'Link our records to upstream records' },
		{ name: 'Operations', description: 'Health and cache control' }
	]
};

export function createApp(): OpenAPIHono {
	const app = new OpenAPIHono({
		// Surface validation failures in the standard error shape rather than
		// Zod's raw output, so every 400 from this API looks the same.
		defaultHook: (result, c) => {
			if (!result.success) {
				const detail = result.error.issues
					.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
					.join('; ');
				return c.json({ error: `Invalid request — ${detail}`, status: 400 }, 400);
			}
			return undefined;
		}
	});

	app.use('*', logger());

	if (config.corsOrigins.length > 0) {
		app.use('*', cors({ origin: config.corsOrigins, allowMethods: ['GET', 'POST'] }));
	}

	app.route('/events', events);
	app.route('/players', players);
	app.route('/rankings', rankings);
	app.route('/ratings', ratings);
	app.route('/snapshots', snapshots);
	app.route('/match', match);
	app.route('/', admin);

	app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
		type: 'http',
		scheme: 'bearer',
		description: 'Shared secret from REFRESH_TOKEN. Only used by POST /refresh.'
	});

	// The machine-readable spec, generated from the same route definitions that
	// validate requests — it cannot drift from the implementation.
	app.doc31('/openapi.json', OPENAPI_DOC);

	// Browsable reference UI.
	app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'FPA Results API' }));

	app.get('/', (c) => c.redirect('/docs'));

	app.notFound((c) => c.json({ error: 'Not found', status: 404 }, 404));

	app.onError((error, c) => {
		if (error instanceof HTTPException) return error.getResponse();

		// Requests arriving before the first successful load are an expected
		// cold-start state, not a bug worth a 500.
		if (error.name === 'IndexNotReady') {
			return c.json({ error: 'Data is still loading, retry shortly', status: 503 }, 503, {
				'retry-after': '5'
			});
		}

		console.error('[error]', error);
		return c.json({ error: 'Internal server error', status: 500 }, 500);
	});

	return app;
}

export type AppType = ReturnType<typeof createApp>;
