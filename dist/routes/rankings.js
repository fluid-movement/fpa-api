import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { commonErrors, httpError, notFoundResponse, paginate } from '../lib/http.js';
import { RankingEntrySchema } from '../schemas/domain.js';
import { RankingsQuery } from '../schemas/params.js';
import { store } from '../store/store.js';
export const rankings = new OpenAPIHono();
const seriesRoute = createRoute({
    method: 'get',
    path: '/series',
    tags: ['Rankings'],
    summary: 'List available ranking series',
    description: 'Call this to discover valid `series` values rather than hardcoding them. ' +
        'Elo-style ratings are a different thing entirely — see `GET /ratings/series`.',
    responses: {
        200: {
            description: 'Available ranking series',
            content: {
                'application/json': {
                    schema: z
                        .object({
                        series: z.array(z.object({
                            series: z.string(),
                            division: z.string(),
                            playerCount: z.number()
                        }))
                    })
                        .openapi('RankingSeriesList')
                }
            }
        },
        ...commonErrors
    }
});
rankings.openapi(seriesRoute, (c) => {
    const index = store.requireIndex();
    return c.json({
        series: [...index.rankings.values()].map((s) => ({
            series: s.series,
            division: s.division,
            playerCount: s.entries.length
        }))
    }, 200);
});
const currentRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Rankings'],
    summary: 'Get the current ranking standings',
    description: 'Cumulative tournament points. Defaults to `ranking-open`. Each entry carries a `breakdown` ' +
        'tying its points back to the specific events that earned them — a join the upstream ' +
        'services do not offer.',
    request: { query: RankingsQuery },
    responses: {
        200: {
            description: 'A page of ranked players',
            content: {
                'application/json': {
                    schema: z
                        .object({
                        series: z.string(),
                        division: z.string(),
                        items: z.array(RankingEntrySchema),
                        total: z.number(),
                        limit: z.number(),
                        offset: z.number()
                    })
                        .openapi('PaginatedRankings')
                }
            }
        },
        ...notFoundResponse,
        ...commonErrors
    }
});
rankings.openapi(currentRoute, (c) => {
    const index = store.requireIndex();
    const { series: requested, division, limit, offset } = c.req.valid('query');
    const key = requested ?? `ranking-${division ?? 'open'}`;
    const series = index.rankings.get(key);
    if (!series) {
        throw httpError(404, `Unknown ranking series "${key}". Available: ${[...index.rankings.keys()].join(', ')}`);
    }
    return c.json({
        series: series.series,
        division: series.division,
        ...paginate(series.entries, { limit, offset })
    }, 200);
});
//# sourceMappingURL=rankings.js.map