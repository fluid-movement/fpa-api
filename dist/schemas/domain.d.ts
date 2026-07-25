import { z } from '@hono/zod-openapi';
/**
 * Zod schemas for everything this API returns.
 *
 * These are the single source of truth: the OpenAPI document, request
 * validation and the inferred TypeScript types all derive from here, so a
 * response shape cannot drift from its documentation.
 *
 * `.openapi()` names a schema so it appears as a reusable component in the spec
 * rather than being inlined at every use site.
 */
export declare const PlayerSchema: z.ZodObject<{
    id: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    fullName: z.ZodString;
    country: z.ZodNullable<z.ZodString>;
    gender: z.ZodNullable<z.ZodString>;
    membership: z.ZodNullable<z.ZodNumber>;
    fpaWebsiteId: z.ZodNullable<z.ZodString>;
    aliasIds: z.ZodArray<z.ZodString>;
    createdAt: z.ZodNullable<z.ZodNumber>;
    lastActive: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const EventSummarySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    startDate: z.ZodNullable<z.ZodString>;
    endDate: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodNullable<z.ZodNumber>;
    fpaWebsiteId: z.ZodNullable<z.ZodString>;
    fpaWebsiteSlug: z.ZodNullable<z.ZodString>;
    divisions: z.ZodArray<z.ZodString>;
    resultCount: z.ZodNumber;
}, z.core.$strip>;
export declare const TeamMemberSchema: z.ZodObject<{
    id: z.ZodString;
    fullName: z.ZodString;
    unknown: z.ZodBoolean;
}, z.core.$strip>;
export declare const TeamSchema: z.ZodObject<{
    place: z.ZodNullable<z.ZodNumber>;
    points: z.ZodNullable<z.ZodNumber>;
    players: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        fullName: z.ZodString;
        unknown: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const PoolSchema: z.ZodObject<{
    name: z.ZodString;
    teams: z.ZodArray<z.ZodObject<{
        place: z.ZodNullable<z.ZodNumber>;
        points: z.ZodNullable<z.ZodNumber>;
        players: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            fullName: z.ZodString;
            unknown: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const RoundSchema: z.ZodObject<{
    number: z.ZodNumber;
    name: z.ZodString;
    pools: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        teams: z.ZodArray<z.ZodObject<{
            place: z.ZodNullable<z.ZodNumber>;
            points: z.ZodNullable<z.ZodNumber>;
            players: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                fullName: z.ZodString;
                unknown: z.ZodBoolean;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const DivisionResultSchema: z.ZodObject<{
    id: z.ZodString;
    eventId: z.ZodString;
    eventName: z.ZodString;
    division: z.ZodString;
    divisionRaw: z.ZodString;
    createdAt: z.ZodNullable<z.ZodNumber>;
    rounds: z.ZodArray<z.ZodObject<{
        number: z.ZodNumber;
        name: z.ZodString;
        pools: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            teams: z.ZodArray<z.ZodObject<{
                place: z.ZodNullable<z.ZodNumber>;
                points: z.ZodNullable<z.ZodNumber>;
                players: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    fullName: z.ZodString;
                    unknown: z.ZodBoolean;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const RankingBreakdownEntrySchema: z.ZodObject<{
    resultId: z.ZodString;
    points: z.ZodNumber;
    eventId: z.ZodNullable<z.ZodString>;
    eventName: z.ZodNullable<z.ZodString>;
    division: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const RankingEntrySchema: z.ZodObject<{
    rank: z.ZodNumber;
    playerId: z.ZodString;
    fullName: z.ZodString;
    points: z.ZodNumber;
    resultsCount: z.ZodNumber;
    breakdown: z.ZodArray<z.ZodObject<{
        resultId: z.ZodString;
        points: z.ZodNumber;
        eventId: z.ZodNullable<z.ZodString>;
        eventName: z.ZodNullable<z.ZodString>;
        division: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const SnapshotRefSchema: z.ZodObject<{
    key: z.ZodString;
    type: z.ZodEnum<{
        ranking: "ranking";
        rating: "rating";
    }>;
    division: z.ZodString;
    date: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const RankingSeriesSchema: z.ZodObject<{
    series: z.ZodString;
    type: z.ZodLiteral<"ranking">;
    division: z.ZodString;
    entries: z.ZodArray<z.ZodObject<{
        rank: z.ZodNumber;
        playerId: z.ZodString;
        fullName: z.ZodString;
        points: z.ZodNumber;
        resultsCount: z.ZodNumber;
        breakdown: z.ZodArray<z.ZodObject<{
            resultId: z.ZodString;
            points: z.ZodNumber;
            eventId: z.ZodNullable<z.ZodString>;
            eventName: z.ZodNullable<z.ZodString>;
            division: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const RatingEntrySchema: z.ZodObject<{
    rank: z.ZodNumber;
    playerId: z.ZodString;
    fullName: z.ZodString;
    rating: z.ZodNumber;
    matchCount: z.ZodNumber;
    peakRating: z.ZodNullable<z.ZodNumber>;
    peakRatingDate: z.ZodNullable<z.ZodString>;
    peakRank: z.ZodNullable<z.ZodNumber>;
    peakRankDate: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const RatingSeriesSchema: z.ZodObject<{
    series: z.ZodString;
    type: z.ZodLiteral<"rating">;
    division: z.ZodString;
    entries: z.ZodArray<z.ZodObject<{
        rank: z.ZodNumber;
        playerId: z.ZodString;
        fullName: z.ZodString;
        rating: z.ZodNumber;
        matchCount: z.ZodNumber;
        peakRating: z.ZodNullable<z.ZodNumber>;
        peakRatingDate: z.ZodNullable<z.ZodString>;
        peakRank: z.ZodNullable<z.ZodNumber>;
        peakRankDate: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const PlayerPlacementSchema: z.ZodObject<{
    resultId: z.ZodString;
    eventId: z.ZodString;
    eventName: z.ZodString;
    eventDate: z.ZodNullable<z.ZodString>;
    division: z.ZodString;
    round: z.ZodNumber;
    roundName: z.ZodString;
    pool: z.ZodString;
    place: z.ZodNullable<z.ZodNumber>;
    points: z.ZodNullable<z.ZodNumber>;
    teammates: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        fullName: z.ZodString;
        unknown: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const PlayerStatsSchema: z.ZodObject<{
    eventCount: z.ZodNumber;
    placementCount: z.ZodNumber;
    wins: z.ZodNumber;
    podiums: z.ZodNumber;
    firstEventDate: z.ZodNullable<z.ZodString>;
    lastEventDate: z.ZodNullable<z.ZodString>;
    divisions: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const PlayerRankingSchema: z.ZodObject<{
    series: z.ZodString;
    division: z.ZodString;
    rank: z.ZodNumber;
    points: z.ZodNumber;
    resultsCount: z.ZodNumber;
}, z.core.$strip>;
export declare const PlayerRatingSchema: z.ZodObject<{
    series: z.ZodString;
    division: z.ZodString;
    rank: z.ZodNumber;
    rating: z.ZodNumber;
    matchCount: z.ZodNumber;
    peakRating: z.ZodNullable<z.ZodNumber>;
    peakRatingDate: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const PlayerProfileSchema: z.ZodObject<{
    player: z.ZodObject<{
        id: z.ZodString;
        firstName: z.ZodString;
        lastName: z.ZodString;
        fullName: z.ZodString;
        country: z.ZodNullable<z.ZodString>;
        gender: z.ZodNullable<z.ZodString>;
        membership: z.ZodNullable<z.ZodNumber>;
        fpaWebsiteId: z.ZodNullable<z.ZodString>;
        aliasIds: z.ZodArray<z.ZodString>;
        createdAt: z.ZodNullable<z.ZodNumber>;
        lastActive: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>;
    stats: z.ZodObject<{
        eventCount: z.ZodNumber;
        placementCount: z.ZodNumber;
        wins: z.ZodNumber;
        podiums: z.ZodNumber;
        firstEventDate: z.ZodNullable<z.ZodString>;
        lastEventDate: z.ZodNullable<z.ZodString>;
        divisions: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    rankings: z.ZodArray<z.ZodObject<{
        series: z.ZodString;
        division: z.ZodString;
        rank: z.ZodNumber;
        points: z.ZodNumber;
        resultsCount: z.ZodNumber;
    }, z.core.$strip>>;
    ratings: z.ZodArray<z.ZodObject<{
        series: z.ZodString;
        division: z.ZodString;
        rank: z.ZodNumber;
        rating: z.ZodNumber;
        matchCount: z.ZodNumber;
        peakRating: z.ZodNullable<z.ZodNumber>;
        peakRatingDate: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    placements: z.ZodArray<z.ZodObject<{
        resultId: z.ZodString;
        eventId: z.ZodString;
        eventName: z.ZodString;
        eventDate: z.ZodNullable<z.ZodString>;
        division: z.ZodString;
        round: z.ZodNumber;
        roundName: z.ZodString;
        pool: z.ZodString;
        place: z.ZodNullable<z.ZodNumber>;
        points: z.ZodNullable<z.ZodNumber>;
        teammates: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            fullName: z.ZodString;
            unknown: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ErrorSchema: z.ZodObject<{
    error: z.ZodString;
    status: z.ZodNumber;
}, z.core.$strip>;
/** Wrap any item schema in the standard pagination envelope. */
export declare function paginated<T extends z.ZodTypeAny>(item: T, name: string): z.ZodObject<{
    items: z.ZodArray<T>;
    total: z.ZodNumber;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
}, z.core.$strip>;
