import type { PlayerPlacement } from './types.js';

/**
 * Wins and podiums count a finish in the final round (`round === 1`) only,
 * once per event and division. Earlier rounds place within a pool, which is
 * not a result, so a division with no final row counts nothing.
 */
export function countFinalResults(placements: PlayerPlacement[]): { wins: number; podiums: number } {
	const finals = new Map<string, number | null>();
	for (const p of placements) {
		if (p.round !== 1) continue;
		const key = `${p.eventId}\u0000${p.division}`;
		const best = finals.get(key);
		if (best === undefined || (p.place !== null && (best === null || p.place < best))) {
			finals.set(key, p.place);
		}
	}

	let wins = 0;
	let podiums = 0;
	for (const place of finals.values()) {
		if (place === 1) wins++;
		if (place !== null && place <= 3) podiums++;
	}
	return { wins, podiums };
}
