import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { commonErrors, notFound, notFoundResponse, paginate } from '../lib/http.js';
import { DivisionResultSchema, EventSummarySchema, paginated } from '../schemas/domain.js';
import { EventIdParam, EventListQuery, EventResultsQuery } from '../schemas/params.js';
import { store } from '../store/store.js';
export const events = new OpenAPIHono();
const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Events'],
    summary: 'List events',
    description: 'Every event known to the upstream event-summary service, newest first. ' +
        'Events without a start date sort last rather than being omitted.',
    request: { query: EventListQuery },
    responses: {
        200: {
            description: 'A page of events',
            content: {
                'application/json': { schema: paginated(EventSummarySchema, 'PaginatedEvents') }
            }
        },
        ...commonErrors
    }
});
events.openapi(listRoute, (c) => {
    const index = store.requireIndex();
    const { q, from, to, division, hasResults, limit, offset } = c.req.valid('query');
    let items = [...index.events.values()];
    if (q) {
        const needle = q.toLowerCase();
        items = items.filter((e) => e.name.toLowerCase().includes(needle));
    }
    if (from)
        items = items.filter((e) => e.startDate !== null && e.startDate >= from);
    if (to)
        items = items.filter((e) => e.startDate !== null && e.startDate <= to);
    if (division)
        items = items.filter((e) => e.divisions.includes(division));
    if (hasResults === 'true')
        items = items.filter((e) => e.resultCount > 0);
    if (hasResults === 'false')
        items = items.filter((e) => e.resultCount === 0);
    items.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
    return c.json(paginate(items, { limit, offset }), 200);
});
const detailRoute = createRoute({
    method: 'get',
    path: '/{eventId}',
    tags: ['Events'],
    summary: 'Get an event with its results',
    request: { params: EventIdParam },
    responses: {
        200: {
            description: 'The event and every division result recorded for it',
            content: {
                'application/json': {
                    schema: z
                        .object({
                        event: EventSummarySchema,
                        results: z.array(DivisionResultSchema)
                    })
                        .openapi('EventDetail')
                }
            }
        },
        ...notFoundResponse,
        ...commonErrors
    }
});
events.openapi(detailRoute, (c) => {
    const index = store.requireIndex();
    const { eventId } = c.req.valid('param');
    const event = index.events.get(eventId);
    if (!event)
        throw notFound('Event', eventId);
    return c.json({ event, results: index.resultsByEvent.get(eventId) ?? [] }, 200);
});
const resultsRoute = createRoute({
    method: 'get',
    path: '/{eventId}/results',
    tags: ['Events'],
    summary: 'Get only the results for an event',
    description: 'Use this when rendering a results table and the event metadata is already known.',
    request: { params: EventIdParam, query: EventResultsQuery },
    responses: {
        200: {
            description: 'Results for the event',
            content: {
                'application/json': {
                    schema: z
                        .object({ eventId: z.string(), results: z.array(DivisionResultSchema) })
                        .openapi('EventResults')
                }
            }
        },
        ...notFoundResponse,
        ...commonErrors
    }
});
events.openapi(resultsRoute, (c) => {
    const index = store.requireIndex();
    const { eventId } = c.req.valid('param');
    const { division } = c.req.valid('query');
    if (!index.events.has(eventId))
        throw notFound('Event', eventId);
    let results = index.resultsByEvent.get(eventId) ?? [];
    if (division)
        results = results.filter((r) => r.division === division);
    return c.json({ eventId, results }, 200);
});
//# sourceMappingURL=events.js.map