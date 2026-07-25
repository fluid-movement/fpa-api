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
export const PlayerSchema = z
    .object({
    id: z.string().describe('Canonical player GUID, shared across all upstream services'),
    firstName: z.string(),
    lastName: z.string(),
    fullName: z.string(),
    country: z.string().nullable().describe('3-letter country code'),
    gender: z.string().nullable().describe('Withheld unless EXPOSE_PERSONAL_FIELDS is enabled'),
    membership: z.number().nullable().describe('Withheld unless EXPOSE_PERSONAL_FIELDS is enabled'),
    fpaWebsiteId: z.string().nullable().describe('Id of this player on the legacy FPA website'),
    aliasIds: z.array(z.string()).describe('Duplicate GUIDs that resolve to this player'),
    createdAt: z.number().nullable(),
    lastActive: z.number().nullable()
})
    .openapi('Player');
export const EventSummarySchema = z
    .object({
    id: z.string(),
    name: z.string(),
    startDate: z.string().nullable().describe('YYYY-MM-DD'),
    endDate: z.string().nullable().describe('YYYY-MM-DD'),
    createdAt: z.number().nullable(),
    fpaWebsiteId: z.string().nullable(),
    fpaWebsiteSlug: z.string().nullable(),
    divisions: z.array(z.string()).describe('Normalized divisions that have results'),
    resultCount: z.number()
})
    .openapi('EventSummary');
export const TeamMemberSchema = z
    .object({
    id: z.string(),
    fullName: z.string(),
    unknown: z.boolean().describe('True when this GUID is absent from the player directory')
})
    .openapi('TeamMember');
export const TeamSchema = z
    .object({
    place: z
        .number()
        .nullable()
        .describe('Finishing position in this pool. 1 is best. Sort and display by this.'),
    points: z
        .number()
        .nullable()
        .describe('Raw score as recorded, whose meaning DEPENDS ON THE RULESET the event used. ' +
        'Under FPA2020 scoring a higher number is better; under SimpleRanking it is a sum of ' +
        'judge ranks, so a LOWER number is better. The ruleset is not exposed in the results ' +
        'data, so points are not comparable across events — never sort or rank by this field. ' +
        'Use `place`.'),
    players: z.array(TeamMemberSchema)
})
    .openapi('Team');
export const PoolSchema = z
    .object({
    name: z.string().describe('Pool letter, e.g. "A"'),
    teams: z.array(TeamSchema).describe('Ordered by placement')
})
    .openapi('Pool');
export const RoundSchema = z
    .object({
    number: z.number().describe('1 is the final, counting backwards'),
    name: z.string().describe('e.g. "Finals", "Semifinals"'),
    pools: z.array(PoolSchema)
})
    .openapi('Round');
export const DivisionResultSchema = z
    .object({
    id: z.string(),
    eventId: z.string(),
    eventName: z.string(),
    division: z.string().describe('Canonical division name'),
    divisionRaw: z.string().describe('Exactly as stored upstream, before normalization'),
    createdAt: z.number().nullable(),
    rounds: z.array(RoundSchema)
})
    .openapi('DivisionResult');
export const RankingBreakdownEntrySchema = z
    .object({
    resultId: z.string(),
    points: z.number(),
    eventId: z.string().nullable(),
    eventName: z.string().nullable(),
    division: z.string().nullable()
})
    .openapi('RankingBreakdownEntry');
export const RankingEntrySchema = z
    .object({
    rank: z.number(),
    playerId: z.string(),
    fullName: z.string(),
    points: z.number(),
    resultsCount: z.number(),
    breakdown: z
        .array(RankingBreakdownEntrySchema)
        .describe('Which events produced these points, highest first')
})
    .openapi('RankingEntry');
export const SnapshotRefSchema = z
    .object({
    key: z.string(),
    type: z.enum(['ranking', 'rating']),
    division: z.string(),
    date: z.string().nullable().describe('YYYY-MM-DD'),
    createdAt: z.number().nullable()
})
    .openapi('SnapshotRef');
export const RankingSeriesSchema = z
    .object({
    series: z.string(),
    type: z.literal('ranking'),
    division: z.string(),
    entries: z.array(RankingEntrySchema)
})
    .openapi('RankingSeries');
export const RatingEntrySchema = z
    .object({
    rank: z.number().describe('Positional — ratings carry no stored rank'),
    playerId: z.string(),
    fullName: z.string(),
    rating: z.number().describe('Elo-style strength estimate'),
    matchCount: z
        .number()
        .describe('Head-to-head comparisons behind this rating; low counts are unreliable'),
    peakRating: z.number().nullable(),
    peakRatingDate: z.string().nullable().describe('YYYY-MM-DD'),
    peakRank: z.number().nullable(),
    peakRankDate: z.string().nullable().describe('YYYY-MM-DD')
})
    .openapi('RatingEntry');
export const RatingSeriesSchema = z
    .object({
    series: z.string(),
    type: z.literal('rating'),
    division: z.string(),
    entries: z.array(RatingEntrySchema)
})
    .openapi('RatingSeries');
export const PlayerPlacementSchema = z
    .object({
    resultId: z.string(),
    eventId: z.string(),
    eventName: z.string(),
    eventDate: z.string().nullable(),
    division: z.string(),
    round: z.number(),
    roundName: z.string(),
    pool: z.string(),
    place: z.number().nullable(),
    points: z.number().nullable(),
    teammates: z.array(TeamMemberSchema)
})
    .openapi('PlayerPlacement');
export const PlayerStatsSchema = z
    .object({
    eventCount: z.number(),
    placementCount: z.number(),
    wins: z.number().describe('First places across all rounds and pools'),
    podiums: z.number(),
    firstEventDate: z.string().nullable(),
    lastEventDate: z.string().nullable(),
    divisions: z.array(z.string())
})
    .openapi('PlayerStats');
export const PlayerRankingSchema = z
    .object({
    series: z.string(),
    division: z.string(),
    rank: z.number(),
    points: z.number(),
    resultsCount: z.number()
})
    .openapi('PlayerRanking');
export const PlayerRatingSchema = z
    .object({
    series: z.string(),
    division: z.string(),
    rank: z.number(),
    rating: z.number(),
    matchCount: z.number(),
    peakRating: z.number().nullable(),
    peakRatingDate: z.string().nullable()
})
    .openapi('PlayerRating');
export const PlayerProfileSchema = z
    .object({
    player: PlayerSchema,
    stats: PlayerStatsSchema,
    rankings: z
        .array(PlayerRankingSchema)
        .describe('Standings in points-based ranking series. Empty if unranked.'),
    ratings: z
        .array(PlayerRatingSchema)
        .describe('Standings in Elo-style rating series. Empty if unrated.'),
    placements: z.array(PlayerPlacementSchema).describe('Most recent first')
})
    .openapi('PlayerProfile');
export const ErrorSchema = z
    .object({
    error: z.string(),
    status: z.number()
})
    .openapi('Error');
/** Wrap any item schema in the standard pagination envelope. */
export function paginated(item, name) {
    return z
        .object({
        items: z.array(item),
        total: z.number().describe('Total matching items, before pagination'),
        limit: z.number(),
        offset: z.number()
    })
        .openapi(name);
}
//# sourceMappingURL=domain.js.map