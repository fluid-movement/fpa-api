import { describe, expect, it } from 'vitest';
import { dateProximity, nameSimilarity, rankCandidates } from './matching.js';

describe('nameSimilarity', () => {
	it('scores an identical name as a perfect match', () => {
		expect(nameSimilarity('Anzio Spring Jam', 'Anzio Spring Jam')).toBe(1);
	});

	it('ignores case and punctuation', () => {
		expect(nameSimilarity('DM26 - German Champs', 'dm26 german champs')).toBe(1);
	});

	it('scores unrelated names near zero', () => {
		expect(nameSimilarity('Anzio Spring Jam', 'Tokyo Winter Cup')).toBe(0);
	});

	it('ignores words that carry no signal in freestyle event names', () => {
		// Almost every event contains "freestyle"/"frisbee"/"championship", so
		// counting them would make every pair look similar.
		expect(nameSimilarity('Freestyle Frisbee Championship Berlin', 'Berlin')).toBe(1);
	});

	it('returns zero when a name reduces to nothing meaningful', () => {
		expect(nameSimilarity('freestyle frisbee', 'Anzio Jam')).toBe(0);
	});
});

describe('dateProximity', () => {
	it('scores the same day as a perfect match', () => {
		expect(dateProximity('2026-05-01', '2026-05-01')).toBe(1);
	});

	it('decays with distance and floors at 30 days', () => {
		expect(dateProximity('2026-05-01', '2026-05-16')).toBeCloseTo(0.5, 1);
		expect(dateProximity('2026-05-01', '2026-08-01')).toBe(0);
	});

	it('returns zero for missing or unparseable dates', () => {
		expect(dateProximity(null, '2026-05-01')).toBe(0);
		expect(dateProximity('not a date', '2026-05-01')).toBe(0);
	});
});

describe('rankCandidates', () => {
	const events = [
		{ name: 'Anzio Spring Jam 5 2026', startDate: '2026-05-17' },
		{ name: 'Tokyo Winter Cup 2025', startDate: '2025-12-01' },
		{ name: 'Anzio Autumn Jam 2026', startDate: '2026-10-02' }
	];

	const accessors = {
		name: (e: (typeof events)[number]) => e.name,
		startDate: (e: (typeof events)[number]) => e.startDate
	};

	it('ranks the best match first', () => {
		const ranked = rankCandidates(events, { name: 'Anzio Spring Jam 5 2026', startDate: '2026-05-17' }, accessors);
		expect(ranked[0]!.item.name).toBe('Anzio Spring Jam 5 2026');
	});

	it('uses the date to break a name tie', () => {
		// Both Anzio events share most tokens; only the date separates them.
		const ranked = rankCandidates(events, { name: 'Anzio Jam 2026', startDate: '2026-10-01' }, accessors);
		expect(ranked[0]!.item.name).toBe('Anzio Autumn Jam 2026');
	});

	it('marks an exact name-and-date match as confident', () => {
		const ranked = rankCandidates(events, { name: 'Anzio Spring Jam 5 2026', startDate: '2026-05-17' }, accessors);
		expect(ranked[0]!.confident).toBe(true);
	});

	it('does not mark a same-name-different-year match as confident', () => {
		// The trap this whole module exists to avoid: recurring annual events.
		const ranked = rankCandidates(events, { name: 'Anzio Spring Jam 5 2026', startDate: '2027-05-17' }, accessors);
		expect(ranked.every((r) => !r.confident)).toBe(true);
	});

	it('excludes candidates below the relevance floor', () => {
		const ranked = rankCandidates(events, { name: 'Completely Unrelated Gathering' }, accessors);
		expect(ranked).toEqual([]);
	});

	it('respects the result limit', () => {
		const ranked = rankCandidates(events, { name: 'Anzio Jam 2026' }, accessors, 1);
		expect(ranked).toHaveLength(1);
	});
});
