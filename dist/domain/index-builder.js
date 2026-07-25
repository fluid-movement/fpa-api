import { normalizeDivision, parseSeriesKey } from './divisions.js';
import { buildPlayers } from './players.js';
import { normalizeResult } from './results.js';
/**
 * Reshape a single-snapshot payload into the series-keyed form the index
 * builder expects.
 *
 * `downloadPointsData/{key}` returns a bare array for the one series its key
 * names, whereas `downloadLatestPointsData` returns an object keyed by series.
 * The series is recovered from the snapshot key ('ranking-open_2026-6-8' ->
 * 'ranking-open'), which also determines whether these are rankings or ratings.
 * The object form is still accepted in case upstream ever unifies them.
 */
export function snapshotToPoints(snapshotKey, payload) {
    const data = payload.data;
    if (!data)
        return {};
    if (!Array.isArray(data))
        return { data };
    const seriesKey = snapshotKey.split('_')[0] ?? snapshotKey;
    return { data: { [seriesKey]: data } };
}
/** Upstream dates are 'YYYY-M-D' in the manifest; pad to a sortable ISO date. */
function padDate(date) {
    if (!date)
        return null;
    const parts = date.split('-');
    if (parts.length !== 3)
        return date;
    const [y, m, d] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
function buildSnapshots(manifest) {
    return Object.values(manifest.manifest ?? {})
        .filter((entry) => entry.key && entry.isHidden !== true)
        .map((entry) => {
        const { type, division } = parseSeriesKey(entry.key.split('_')[0] ?? '');
        return {
            key: entry.key,
            type,
            division: entry.divisionName ?? division,
            date: padDate(entry.date),
            createdAt: entry.createdAt ?? null
        };
    })
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}
/**
 * Split the points payload into rankings and ratings.
 *
 * Both arrive under `data` keyed by series name, but they are different data:
 * `ranking-*` entries are cumulative tournament points with a per-result
 * breakdown, `rating-*` entries are an Elo-style strength estimate. We key off
 * the series prefix and validate the shape, so a series that does not look like
 * what its name claims is skipped rather than silently zeroed.
 */
export function buildPointsSeries(points, results) {
    const rankings = new Map();
    const ratings = new Map();
    const warnings = [];
    for (const [seriesKey, rawEntries] of Object.entries(points.data ?? {})) {
        if (!Array.isArray(rawEntries))
            continue;
        const { type, division } = parseSeriesKey(seriesKey);
        if (type === 'rating') {
            const entries = rawEntries
                .map((entry) => entry)
                .filter((entry) => entry.id && typeof entry.rating === 'number')
                // Upstream stores ratings pre-sorted, but do not depend on it.
                .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
                .map((entry, position) => ({
                // Ratings carry no explicit rank; it is positional.
                rank: position + 1,
                playerId: entry.id,
                fullName: entry.fullName?.trim() || 'Unknown Player',
                rating: entry.rating,
                matchCount: entry.matchCount ?? 0,
                peakRating: entry.highestRating ?? null,
                peakRatingDate: padDate(entry.highestRatingDate),
                peakRank: entry.highestRank ?? null,
                peakRankDate: padDate(entry.highestRankDate)
            }));
            if (entries.length !== rawEntries.length) {
                warnings.push(`Rating series "${seriesKey}": ${rawEntries.length - entries.length} entr(ies) skipped for missing id or rating`);
            }
            ratings.set(seriesKey, { series: seriesKey, type: 'rating', division, entries });
            continue;
        }
        const entries = rawEntries
            .map((entry) => entry)
            .filter((entry) => entry.id)
            .map((entry) => ({
            rank: entry.rank ?? 0,
            playerId: entry.id,
            fullName: entry.fullName?.trim() || 'Unknown Player',
            points: entry.points ?? 0,
            resultsCount: entry.resultsCount ?? 0,
            // This join is the point of the whole service: it turns "1632
            // points" into "which events earned them".
            breakdown: (entry.pointsList ?? [])
                .filter((p) => p.resultsId)
                .map((p) => {
                const result = results.get(p.resultsId);
                return {
                    resultId: p.resultsId,
                    points: p.points ?? 0,
                    eventId: result?.eventId ?? null,
                    eventName: result?.eventName ?? null,
                    division: result?.division ?? null
                };
            })
                .sort((a, b) => b.points - a.points)
        }))
            .sort((a, b) => a.rank - b.rank);
        rankings.set(seriesKey, { series: seriesKey, type: 'ranking', division, entries });
    }
    return { rankings, ratings, warnings };
}
/** Flatten results into a per-player placement list for profiles and dashboards. */
function buildPlacements(results, events) {
    const byPlayer = new Map();
    for (const result of results.values()) {
        const eventDate = events.get(result.eventId)?.startDate ?? null;
        for (const round of result.rounds) {
            for (const pool of round.pools) {
                for (const team of pool.teams) {
                    for (const member of team.players) {
                        const placement = {
                            resultId: result.id,
                            eventId: result.eventId,
                            eventName: result.eventName,
                            eventDate,
                            division: result.division,
                            round: round.number,
                            roundName: round.name,
                            pool: pool.name,
                            place: team.place,
                            points: team.points,
                            teammates: team.players.filter((p) => p.id !== member.id)
                        };
                        const list = byPlayer.get(member.id);
                        if (list)
                            list.push(placement);
                        else
                            byPlayer.set(member.id, [placement]);
                    }
                }
            }
        }
    }
    // Most recent first — that is how every consumer wants to render it.
    for (const list of byPlayer.values()) {
        list.sort((a, b) => (b.eventDate ?? '').localeCompare(a.eventDate ?? ''));
    }
    return byPlayer;
}
/**
 * Build the complete read model from a raw corpus.
 *
 * Pure and synchronous: no I/O, no clock beyond `builtAt`. That makes the whole
 * normalization surface testable against recorded fixtures.
 */
export function buildIndex(corpus) {
    const warnings = [];
    const { players, canonicalPlayerId, warnings: playerWarnings } = buildPlayers(corpus.players.players ?? {});
    warnings.push(...playerWarnings);
    // Results first: events need result counts, rankings need result lookups.
    const results = new Map();
    for (const [id, raw] of Object.entries(corpus.results.results ?? {})) {
        const normalized = normalizeResult(id, raw, players, canonicalPlayerId);
        if (normalized)
            results.set(id, normalized);
    }
    const resultsByEvent = new Map();
    for (const result of results.values()) {
        const list = resultsByEvent.get(result.eventId);
        if (list)
            list.push(result);
        else
            resultsByEvent.set(result.eventId, [result]);
    }
    const events = new Map();
    for (const [id, raw] of Object.entries(corpus.events.allEventSummaryData ?? {})) {
        const eventResults = resultsByEvent.get(id) ?? [];
        events.set(id, {
            id,
            name: raw.eventName?.trim() || 'Unnamed Event',
            startDate: raw.startDate ?? null,
            endDate: raw.endDate ?? null,
            createdAt: raw.createdAt ?? null,
            fpaWebsiteId: raw.additionalData?.fpaId ?? null,
            fpaWebsiteSlug: raw.additionalData?.postName ?? null,
            divisions: [...new Set(eventResults.map((r) => r.division))].sort(),
            resultCount: eventResults.length
        });
    }
    // Results can reference events the summary service does not have (2 in prod).
    // Synthesize a stub rather than dropping the results on the floor.
    for (const [eventId, eventResults] of resultsByEvent) {
        if (events.has(eventId))
            continue;
        warnings.push(`Results reference event ${eventId} ("${eventResults[0].eventName}") which is missing from the event directory`);
        events.set(eventId, {
            id: eventId,
            name: eventResults[0].eventName,
            startDate: null,
            endDate: null,
            createdAt: eventResults[0].createdAt,
            fpaWebsiteId: null,
            fpaWebsiteSlug: null,
            divisions: [...new Set(eventResults.map((r) => r.division))].sort(),
            resultCount: eventResults.length
        });
    }
    const unknownPlayerIds = new Set();
    for (const result of results.values()) {
        for (const round of result.rounds) {
            for (const pool of round.pools) {
                for (const team of pool.teams) {
                    for (const member of team.players) {
                        if (member.unknown)
                            unknownPlayerIds.add(member.id);
                    }
                }
            }
        }
    }
    if (unknownPlayerIds.size > 0) {
        warnings.push(`${unknownPlayerIds.size} player id(s) appear in results but are missing from the player directory`);
    }
    const liveEntry = corpus.directory?.eventDirectory?.[0];
    const pointsSeries = buildPointsSeries(corpus.points, results);
    warnings.push(...pointsSeries.warnings);
    return {
        builtAt: Date.now(),
        players,
        canonicalPlayerId,
        events,
        results,
        resultsByEvent,
        placementsByPlayer: buildPlacements(results, events),
        rankings: pointsSeries.rankings,
        ratings: pointsSeries.ratings,
        snapshots: buildSnapshots(corpus.manifest),
        live: liveEntry?.eventKey
            ? {
                eventId: liveEntry.eventKey,
                eventName: liveEntry.eventName?.trim() || 'Unnamed Event',
                modifiedAt: liveEntry.modifiedAt ?? null
            }
            : null,
        warnings
    };
}
/** Division normalization is re-exported for consumers that need the same mapping. */
export { normalizeDivision };
//# sourceMappingURL=index-builder.js.map