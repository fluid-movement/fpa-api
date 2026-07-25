import { normalizeDivision } from './divisions.js';
import { lookupPlayer } from './players.js';
/**
 * Results normalization.
 *
 * Upstream stores a division's results as an object with dynamic keys:
 *
 *   { divisionName, eventId, isHidden?, round1: {...}, round3: {...} }
 *   round  -> { id, poolA: {...}, poolB: {...} }
 *   pool   -> { poolId, teamData: [{ players: [guid], place, points }] }
 *
 * Real-world quirks this handles:
 *   - Round keys are NOT contiguous: round1/round3/round5 with gaps is common.
 *   - Pool keys are usually `poolA` but lowercase `poola` occurs in production.
 *   - `isHidden` marks records that should not be published.
 *   - Player GUIDs may be aliases, or may not exist in the directory at all.
 */
/** Round 1 is the final, counting backwards from there. */
const ROUND_NAMES = {
    1: 'Finals',
    2: 'Semifinals',
    3: 'Quarterfinals'
};
export function roundName(number) {
    return ROUND_NAMES[number] ?? `Round ${number}`;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeTeam(raw, players, canonicalPlayerId) {
    const members = (raw.players ?? []).map((id) => {
        const found = lookupPlayer(id, players, canonicalPlayerId);
        return { id: found.id, fullName: found.fullName, unknown: found.unknown };
    });
    return {
        place: typeof raw.place === 'number' ? raw.place : null,
        points: typeof raw.points === 'number' ? raw.points : null,
        players: members
    };
}
function normalizePool(key, raw, players, canonicalPlayerId) {
    // Prefer the stored poolId, but fall back to the key ('poolA' -> 'A').
    const name = (raw.poolId ?? key.slice(4)).toUpperCase();
    const teams = (Array.isArray(raw.teamData) ? raw.teamData : [])
        .map((team) => normalizeTeam(team, players, canonicalPlayerId))
        // Teams are not stored in placement order.
        .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity));
    return { name, teams };
}
function normalizeRound(number, raw, players, canonicalPlayerId) {
    const pools = [];
    for (const [key, value] of Object.entries(raw)) {
        if (!key.toLowerCase().startsWith('pool') || !isRecord(value))
            continue;
        pools.push(normalizePool(key, value, players, canonicalPlayerId));
    }
    pools.sort((a, b) => a.name.localeCompare(b.name));
    return { number, name: roundName(number), pools };
}
/**
 * Normalize one result record. Returns null for records that should not be
 * published (hidden, or structurally unusable).
 */
export function normalizeResult(id, raw, players, canonicalPlayerId) {
    const data = raw.resultsData;
    if (!data || data.isHidden === true)
        return null;
    const eventId = raw.eventId ?? data.eventId;
    if (!eventId)
        return null;
    const rounds = [];
    for (const [key, value] of Object.entries(data)) {
        const match = /^round(\d+)$/i.exec(key);
        if (!match || !isRecord(value))
            continue;
        const number = Number.parseInt(match[1], 10);
        if (Number.isNaN(number))
            continue;
        rounds.push(normalizeRound(number, value, players, canonicalPlayerId));
    }
    if (rounds.length === 0)
        return null;
    // Round 1 is the final, so ascending order reads finals-first.
    rounds.sort((a, b) => a.number - b.number);
    const divisionRaw = raw.divisionName ?? data.divisionName ?? '';
    return {
        id,
        eventId,
        eventName: raw.eventName?.trim() || 'Unknown Event',
        division: normalizeDivision(divisionRaw),
        divisionRaw,
        createdAt: raw.createdAt ?? null,
        rounds
    };
}
//# sourceMappingURL=results.js.map