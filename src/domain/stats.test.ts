import { describe, expect, it } from 'vitest';
import { countFinalResults } from './stats.js';
import type { PlayerPlacement } from './types.js';

function placement(
	eventId: string,
	division: string,
	round: number,
	place: number | null
): PlayerPlacement {
	return {
		resultId: `${eventId}-${division}-${round}`,
		eventId,
		eventName: eventId,
		eventDate: null,
		division,
		round,
		roundName: round === 1 ? 'Finals' : 'Semifinals',
		pool: 'A',
		place,
		points: null,
		teammates: []
	};
}

describe('countFinalResults', () => {
	it('does not count a first place in an earlier round', () => {
		const result = countFinalResults([
			placement('e1', 'Open Pairs', 1, 1),
			placement('e1', 'Open Pairs', 2, 1)
		]);
		expect(result).toEqual({ wins: 1, podiums: 1 });
	});

	it('does not count a final that is not a podium', () => {
		const result = countFinalResults([
			placement('e1', 'Mixed Pairs', 3, 1),
			placement('e1', 'Mixed Pairs', 2, 2),
			placement('e1', 'Mixed Pairs', 1, 4)
		]);
		expect(result).toEqual({ wins: 0, podiums: 0 });
	});

	it('counts nothing for a division with no final row', () => {
		expect(countFinalResults([placement('e1', 'Open', 2, 1)])).toEqual({ wins: 0, podiums: 0 });
	});

	it('counts each event and division once', () => {
		const result = countFinalResults([
			placement('e1', 'Open', 1, 3),
			placement('e1', 'Open', 1, 3),
			placement('e2', 'Open', 1, 1)
		]);
		expect(result).toEqual({ wins: 1, podiums: 2 });
	});
});
