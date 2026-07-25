import { z } from '@hono/zod-openapi';
/**
 * Reusable request parameter schemas.
 *
 * Query strings are always strings, so anything numeric is coerced here. Doing
 * it in the schema means validation, coercion and documentation stay in one
 * place instead of being repeated per handler.
 */
export const PaginationQuery = z.object({
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(500)
        .default(50)
        .openapi({ description: 'Maximum items to return', example: 50 }),
    offset: z.coerce
        .number()
        .int()
        .min(0)
        .default(0)
        .openapi({ description: 'Items to skip', example: 0 })
});
/** Rankings are long lists; a larger default avoids an immediate second call. */
export const RankingPaginationQuery = PaginationQuery.extend({
    limit: z.coerce.number().int().min(1).max(500).default(100).openapi({ example: 100 })
});
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const DateString = z
    .string()
    .regex(ISO_DATE, 'Must be a date in YYYY-MM-DD format')
    .openapi({ example: '2026-07-25' });
export const EventIdParam = z.object({
    eventId: z.string().openapi({
        param: { name: 'eventId', in: 'path' },
        description: 'Upstream event GUID',
        example: 'aee447a2-0721-4ba7-b4ca-f362889742c8'
    })
});
export const PlayerIdParam = z.object({
    playerId: z.string().openapi({
        param: { name: 'playerId', in: 'path' },
        description: 'Player GUID. An alias GUID is accepted and resolves to the canonical player.',
        example: 'efdaaa1f-0f3d-4f42-8ede-c3330a5f9255'
    })
});
export const SnapshotKeyParam = z.object({
    key: z.string().openapi({
        param: { name: 'key', in: 'path' },
        description: 'Snapshot key from GET /rankings/snapshots',
        example: 'ranking-open_2026-6-8'
    })
});
export const EventListQuery = PaginationQuery.extend({
    q: z.string().optional().openapi({ description: 'Case-insensitive event name search' }),
    from: DateString.optional().openapi({ description: 'Only events starting on or after this date' }),
    to: DateString.optional().openapi({ description: 'Only events starting on or before this date' }),
    division: z.string().optional().openapi({ description: 'Only events with results in this division', example: 'Open Pairs' }),
    hasResults: z
        .enum(['true', 'false'])
        .optional()
        .openapi({ description: 'Restrict to events that have results' })
});
export const PlayerListQuery = PaginationQuery.extend({
    q: z.string().optional().openapi({ description: 'Case-insensitive player name search' }),
    country: z.string().length(3).optional().openapi({ description: '3-letter country code', example: 'ITA' }),
    hasResults: z
        .enum(['true', 'false'])
        .optional()
        .openapi({ description: 'Restrict to players with at least one recorded placement' })
});
export const RankingsQuery = RankingPaginationQuery.extend({
    series: z
        .string()
        .optional()
        .openapi({ description: 'Series key, e.g. "ranking-open". Overrides `division`.', example: 'ranking-open' }),
    division: z
        .string()
        .optional()
        .openapi({ description: 'Short division token, e.g. "open" or "women". Defaults to "open".', example: 'open' })
});
export const RatingsQuery = RankingPaginationQuery.extend({
    series: z
        .string()
        .optional()
        .openapi({ description: 'Series key, e.g. "rating-open". Overrides `division`.', example: 'rating-open' }),
    division: z
        .string()
        .optional()
        .openapi({ description: 'Short division token. Defaults to "open".', example: 'open' }),
    minMatchCount: z.coerce
        .number()
        .int()
        .min(0)
        .optional()
        .openapi({
        description: 'Exclude players with fewer than this many head-to-head matches. Most rated players ' +
            'have very few, so a floor of 50-100 gives a far more meaningful leaderboard.',
        example: 50
    })
});
export const SnapshotListQuery = z.object({
    type: z.enum(['ranking', 'rating']).optional(),
    division: z.string().optional().openapi({ example: 'open' })
});
export const EventResultsQuery = z.object({
    division: z.string().optional().openapi({ description: 'Restrict to a single division', example: 'Open Pairs' })
});
export const MatchEventQuery = z.object({
    name: z.string().min(1).openapi({ description: 'Event name to match against', example: 'German Championship 2026' }),
    startDate: DateString.optional().openapi({ description: 'Improves ranking accuracy when supplied' }),
    hasResults: z
        .enum(['true', 'false'])
        .optional()
        .openapi({ description: 'Restrict to events with results. Defaults to true.' })
});
export const MatchPlayerQuery = z.object({
    name: z.string().min(1).openapi({ description: 'Player name to match against', example: 'Francesco Santolin' })
});
//# sourceMappingURL=params.js.map