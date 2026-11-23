import type {
	PointsManifestResponse,
	RawEventsResponse,
	RawManifestEntry,
	RawManifestResponse,
	RawPlayer,
	RawPlayersResponse,
	RawPointsResponse,
	RawPointsSnapshotResponse,
	RawPool,
	RawResult,
	RawResultsResponse,
	RawRound,
	SyncEvent,
	SyncPlayer,
	SyncRound
} from './types.js';

/**
 * Sync payloads -> the existing Raw* corpus types.
 *
 * The domain normalizers were written against the old AWS services' shapes and are covered by
 * tests built from production quirks. Rather than rewrite them for the cleaner sync payloads, this
 * adapter produces those shapes, so the change stays inside the upstream layer (see the decision
 * "Adapt sync payloads into the existing Raw* types first"). Pure: no I/O, no clock.
 */

/** `sync/players` -> `getAllPlayers`: keyed by id, `aliasId` -> `aliasKey`, `hidden` carried. */
export function adaptPlayers(players: SyncPlayer[]): RawPlayersResponse {
	const out: Record<string, RawPlayer> = {};
	for (const player of players) {
		if (!player.id) continue;
		out[player.id] = {
			key: player.id,
			firstName: player.firstName ?? undefined,
			lastName: player.lastName ?? undefined,
			country: player.country ?? undefined,
			fpaWebsiteId: stringOrUndefined(player.fpaWebsiteId),
			aliasKey: player.aliasId ?? undefined,
			hidden: player.hidden === true ? true : undefined
		};
	}
	return { players: out };
}

/**
 * Sync events -> `getAllEvents` plus `getAllResults`.
 *
 * Each division becomes one result record keyed by the division id (the id rankings cite as
 * `resultsId`), with the dynamic-key layout `normalizeResult` parses:
 *
 *   resultsData.round<N> = { id: N, pool<X>: { poolId: X, teamData: [{ players, place, points }] } }
 */
export function adaptEvents(events: SyncEvent[]): {
	events: RawEventsResponse;
	results: RawResultsResponse;
} {
	const summaries: NonNullable<RawEventsResponse['allEventSummaryData']> = {};
	const results: Record<string, RawResult> = {};

	for (const event of events) {
		if (!event.id) continue;

		summaries[event.id] = {
			key: event.id,
			eventName: event.name ?? undefined,
			startDate: event.startDate ?? undefined,
			endDate: event.endDate ?? undefined,
			additionalData: {
				fpaId: stringOrUndefined(event.fpaId),
				postName: event.postName ?? undefined
			}
		};

		for (const division of event.divisions ?? []) {
			if (!division.id) continue;
			results[division.id] = {
				key: division.id,
				eventId: event.id,
				eventName: event.name ?? undefined,
				divisionName: division.name ?? undefined,
				resultsData: {
					divisionName: division.name ?? undefined,
					eventId: event.id,
					...adaptRounds(division.rounds ?? [])
				}
			};
		}
	}

	return { events: { allEventSummaryData: summaries }, results: { results } };
}

function adaptRounds(rounds: SyncRound[]): Record<string, RawRound> {
	const out: Record<string, RawRound> = {};

	for (const round of rounds) {
		if (typeof round.number !== 'number' || !Number.isInteger(round.number)) continue;
		const roundKey = `round${round.number}`;
		const target: RawRound = out[roundKey] ?? { id: round.number };
		out[roundKey] = target;

		for (const pool of round.pools ?? []) {
			const letter = pool.pool?.trim().toUpperCase() || '?';
			const poolKey = `pool${letter}`;
			const existing = target[poolKey] as RawPool | undefined;
			const teamData = (pool.teams ?? []).map((team) => ({
				players: team.playerIds ?? [],
				place: typeof team.place === 'number' ? team.place : undefined,
				points: typeof team.points === 'number' ? team.points : undefined
			}));
			// The contract promises one entry per letter; merge rather than lose teams if not.
			target[poolKey] = {
				poolId: letter,
				teamData: [...(existing?.teamData ?? []), ...teamData]
			} satisfies RawPool;
		}
	}

	return out;
}

/**
 * Points manifest as the corpus stores it. Only `createdAt` needs care: the contract does not pin
 * its type, and the index sorts snapshots by it numerically, so an ISO string becomes epoch ms.
 */
export function adaptPointsManifest(response: PointsManifestResponse): RawManifestResponse {
	const manifest: Record<string, RawManifestEntry> = {};
	for (const [id, entry] of Object.entries(response.manifest ?? {})) {
		if (!entry || typeof entry !== 'object') continue;
		manifest[id] = { ...entry, createdAt: epochMs(entry.createdAt) };
	}
	return { manifest };
}

/** `ranking-open_2026-11-5` -> `ranking-open`. */
export function seriesOf(snapshotKey: string): string {
	return snapshotKey.split('_')[0] ?? snapshotKey;
}

/**
 * The latest snapshot key of every series: the newest `createdAt` that is not hidden. There is no
 * "latest points" endpoint on the new upstream; this is how its contract defines latest. Ties
 * (equal or missing `createdAt`) fall back to the snapshot date, then the key, so the choice is
 * stable.
 */
export function latestSnapshotKeys(manifest: RawManifestResponse): Record<string, string> {
	const best = new Map<string, RawManifestEntry & { key: string }>();

	for (const [id, entry] of Object.entries(manifest.manifest ?? {})) {
		if (entry.isHidden === true) continue;
		const key = entry.key ?? id;
		if (!key) continue;
		const candidate = { ...entry, key };
		const series = seriesOf(key);
		const current = best.get(series);
		if (!current || compareSnapshots(candidate, current) > 0) best.set(series, candidate);
	}

	return Object.fromEntries([...best].map(([series, entry]) => [series, entry.key]));
}

function compareSnapshots(
	a: RawManifestEntry & { key: string },
	b: RawManifestEntry & { key: string }
): number {
	const created = (a.createdAt ?? -Infinity) - (b.createdAt ?? -Infinity);
	if (created !== 0 && !Number.isNaN(created)) return created;
	const date = paddedDate(a.date).localeCompare(paddedDate(b.date));
	if (date !== 0) return date;
	return a.key.localeCompare(b.key);
}

/**
 * Each series' latest snapshot -> the series-keyed shape of the old `downloadLatestPointsData`.
 * `downloadPointsData` answers with a bare array for the series its key names; an already
 * series-keyed answer is accepted as well.
 */
export function adaptLatestPoints(
	latest: Record<string, { key: string; payload: RawPointsSnapshotResponse }>
): RawPointsResponse {
	const data: NonNullable<RawPointsResponse['data']> = {};

	for (const [series, { payload }] of Object.entries(latest)) {
		const body = payload?.data;
		if (Array.isArray(body)) data[series] = body;
		else if (body && typeof body === 'object' && Array.isArray(body[series])) data[series] = body[series];
	}

	return { data };
}

function stringOrUndefined(value: string | number | null | undefined): string | undefined {
	if (value === null || value === undefined || value === '') return undefined;
	return String(value);
}

function epochMs(value: number | string | undefined): number | undefined {
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (typeof value === 'string') {
		const parsed = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}

/** 'YYYY-M-D' -> 'YYYY-MM-DD', for ordering only. */
function paddedDate(date: string | undefined): string {
	if (!date) return '';
	return date
		.split('-')
		.map((part, i) => (i === 0 ? part : part.padStart(2, '0')))
		.join('-');
}
