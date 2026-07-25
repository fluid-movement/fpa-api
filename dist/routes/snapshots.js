import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { buildPointsSeries, snapshotToPoints } from '../domain/index-builder.js';
import { commonErrors, httpError, notFound, notFoundResponse } from '../lib/http.js';
import { RankingSeriesSchema, RatingSeriesSchema, SnapshotRefSchema } from '../schemas/domain.js';
import { SnapshotKeyParam, SnapshotListQuery } from '../schemas/params.js';
import { sources } from '../upstream/sources.js';
import { store } from '../store/store.js';
export const snapshots = new OpenAPIHono();
const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Snapshots'],
    summary: 'List historical ranking and rating snapshots',
    description: 'Rankings and ratings are published upstream as dated snapshots. This lists them newest ' +
        'first; snapshots flagged hidden upstream are excluded. Use these to chart a player or ' +
        'division over time.',
    request: { query: SnapshotListQuery },
    responses: {
        200: {
            description: 'Available snapshots',
            content: {
                'application/json': {
                    schema: z.object({ snapshots: z.array(SnapshotRefSchema) }).openapi('SnapshotList')
                }
            }
        },
        ...commonErrors
    }
});
snapshots.openapi(listRoute, (c) => {
    const index = store.requireIndex();
    const { type, division } = c.req.valid('query');
    let items = index.snapshots;
    if (type)
        items = items.filter((s) => s.type === type);
    if (division)
        items = items.filter((s) => s.division === division);
    return c.json({ snapshots: items }, 200);
});
const detailRoute = createRoute({
    method: 'get',
    path: '/{key}',
    tags: ['Snapshots'],
    summary: 'Get one historical snapshot',
    description: 'Fetched from upstream on demand rather than held in memory: there are around 100 snapshots ' +
        'and they are read rarely, so caching them all would cost a lot of memory for little gain. ' +
        'Expect this to be slower than the other endpoints. ' +
        'A snapshot contains either rankings or ratings depending on its key; the other array is empty.',
    request: { params: SnapshotKeyParam },
    responses: {
        200: {
            description: 'The snapshot contents',
            content: {
                'application/json': {
                    schema: z
                        .object({
                        snapshot: SnapshotRefSchema,
                        rankings: z.array(RankingSeriesSchema),
                        ratings: z.array(RatingSeriesSchema)
                    })
                        .openapi('SnapshotDetail')
                }
            }
        },
        ...notFoundResponse,
        ...commonErrors
    }
});
snapshots.openapi(detailRoute, async (c) => {
    const index = store.requireIndex();
    const { key } = c.req.valid('param');
    const snapshot = index.snapshots.find((s) => s.key === key);
    if (!snapshot)
        throw notFound('Snapshot', key);
    let payload;
    try {
        payload = await sources.pointsSnapshot(key);
    }
    catch {
        throw httpError(503, `Could not load snapshot "${key}" from upstream`);
    }
    // Reuse the same normalizer as the live standings, against the already-built
    // results index, so a historical snapshot has an identical shape — points
    // breakdown included. Only the points payload differs, and it arrives in a
    // different shape from the live feed, hence snapshotToPoints.
    const { rankings, ratings } = buildPointsSeries(snapshotToPoints(key, payload), index.results);
    return c.json({ snapshot, rankings: [...rankings.values()], ratings: [...ratings.values()] }, 200);
});
//# sourceMappingURL=snapshots.js.map