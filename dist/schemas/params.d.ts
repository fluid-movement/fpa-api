import { z } from '@hono/zod-openapi';
/**
 * Reusable request parameter schemas.
 *
 * Query strings are always strings, so anything numeric is coerced here. Doing
 * it in the schema means validation, coercion and documentation stay in one
 * place instead of being repeated per handler.
 */
export declare const PaginationQuery: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
/** Rankings are long lists; a larger default avoids an immediate second call. */
export declare const RankingPaginationQuery: z.ZodObject<{
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const DateString: z.ZodString;
export declare const EventIdParam: z.ZodObject<{
    eventId: z.ZodString;
}, z.core.$strip>;
export declare const PlayerIdParam: z.ZodObject<{
    playerId: z.ZodString;
}, z.core.$strip>;
export declare const SnapshotKeyParam: z.ZodObject<{
    key: z.ZodString;
}, z.core.$strip>;
export declare const EventListQuery: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    q: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    division: z.ZodOptional<z.ZodString>;
    hasResults: z.ZodOptional<z.ZodEnum<{
        false: "false";
        true: "true";
    }>>;
}, z.core.$strip>;
export declare const PlayerListQuery: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    q: z.ZodOptional<z.ZodString>;
    country: z.ZodOptional<z.ZodString>;
    hasResults: z.ZodOptional<z.ZodEnum<{
        false: "false";
        true: "true";
    }>>;
}, z.core.$strip>;
export declare const RankingsQuery: z.ZodObject<{
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    series: z.ZodOptional<z.ZodString>;
    division: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const RatingsQuery: z.ZodObject<{
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    series: z.ZodOptional<z.ZodString>;
    division: z.ZodOptional<z.ZodString>;
    minMatchCount: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const SnapshotListQuery: z.ZodObject<{
    type: z.ZodOptional<z.ZodEnum<{
        ranking: "ranking";
        rating: "rating";
    }>>;
    division: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const EventResultsQuery: z.ZodObject<{
    division: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const MatchEventQuery: z.ZodObject<{
    name: z.ZodString;
    startDate: z.ZodOptional<z.ZodString>;
    hasResults: z.ZodOptional<z.ZodEnum<{
        false: "false";
        true: "true";
    }>>;
}, z.core.$strip>;
export declare const MatchPlayerQuery: z.ZodObject<{
    name: z.ZodString;
}, z.core.$strip>;
