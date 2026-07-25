import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { commonErrors, httpError, notFoundResponse, paginate } from '../lib/http.js';
import { RatingEntrySchema } from '../schemas/domain.js';
import { RatingsQuery } from '../schemas/params.js';
import { store } from '../store/store.js';
export const ratings = new OpenAPIHono();
const RATINGS_NOTE = 'Ratings are an Elo-style strength estimate derived from head-to-head outcomes. They are NOT ' +
    'the same as rankings: rankings accumulate tournament points over a season, ratings estimate ' +
    'current strength and have no points breakdown. A rating backed by a low `matchCount` is ' +
    'statistically weak — surface that number alongside the rating rather than the rating alone.';
const seriesRoute = createRoute({
    method: 'get',
    path: '/series',
    tags: ['Ratings'],
    summary: 'List available rating series',
    description: RATINGS_NOTE,
    responses: {
        200: {
            description: 'Available rating series',
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
                        .openapi('RatingSeriesList')
                }
            }
        },
        ...commonErrors
    }
});
ratings.openapi(seriesRoute, (c) => {
    const index = store.requireIndex();
    return c.json({
        series: [...index.ratings.values()].map((s) => ({
            series: s.series,
            division: s.division,
            playerCount: s.entries.length
        }))
    }, 200);
});
const currentRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Ratings'],
    summary: 'Get the current rating standings',
    description: `${RATINGS_NOTE} Defaults to \`rating-open\`.`,
    request: { query: RatingsQuery },
    responses: {
        200: {
            description: 'A page of rated players, strongest first',
            content: {
                'application/json': {
                    schema: z
                        .object({
                        series: z.string(),
                        division: z.string(),
                        items: z.array(RatingEntrySchema),
                        total: z.number(),
                        limit: z.number(),
                        offset: z.number()
                    })
                        .openapi('PaginatedRatings')
                }
            }
        },
        ...notFoundResponse,
        ...commonErrors
    }
});
ratings.openapi(currentRoute, (c) => {
    const index = store.requireIndex();
    const { series: requested, division, minMatchCount, limit, offset } = c.req.valid('query');
    const key = requested ?? `rating-${division ?? 'open'}`;
    const series = index.ratings.get(key);
    if (!series) {
        throw httpError(404, `Unknown rating series "${key}". Available: ${[...index.ratings.keys()].join(', ')}`);
    }
    // Most of the 2265 rated players have only a handful of matches behind
    // their number, so filtering is usually what a consumer actually wants.
    const entries = minMatchCount === undefined
        ? series.entries
        : series.entries.filter((e) => e.matchCount >= minMatchCount);
    return c.json({
        series: series.series,
        division: series.division,
        ...paginate(entries, { limit, offset })
    }, 200);
});
//# sourceMappingURL=ratings.js.map