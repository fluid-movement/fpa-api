import { describe, expect, it } from 'vitest';
import { normalizeDivision, parseSeriesKey, UNKNOWN_DIVISION } from './divisions.js';

/**
 * Every string in the "real dirty values" test is one that actually appears in
 * the production results table. Upstream puts no constraint on this field, and
 * rankings group by it, so an unmerged variant silently splits a division.
 */
describe('normalizeDivision', () => {
	it('passes canonical names through unchanged', () => {
		expect(normalizeDivision('Open Pairs')).toBe('Open Pairs');
		expect(normalizeDivision('Women Pairs')).toBe('Women Pairs');
		expect(normalizeDivision('Mixed Pairs')).toBe('Mixed Pairs');
		expect(normalizeDivision('Open Co-op')).toBe('Open Co-op');
	});

	it('merges the real dirty values found in production', () => {
		expect(normalizeDivision('open pairs')).toBe('Open Pairs');
		expect(normalizeDivision('Open pairs')).toBe('Open Pairs');
		expect(normalizeDivision('Open')).toBe('Open Pairs');
		expect(normalizeDivision('Open Coop')).toBe('Open Co-op');
		expect(normalizeDivision('Open Co-op')).toBe('Open Co-op');
		expect(normalizeDivision('Women')).toBe('Women Pairs');
	});

	it('treats data-entry noise as unknown rather than a division', () => {
		expect(normalizeDivision('undefined')).toBe(UNKNOWN_DIVISION);
		expect(normalizeDivision('Results')).toBe(UNKNOWN_DIVISION);
		expect(normalizeDivision('')).toBe(UNKNOWN_DIVISION);
		expect(normalizeDivision(null)).toBe(UNKNOWN_DIVISION);
		expect(normalizeDivision(undefined)).toBe(UNKNOWN_DIVISION);
	});

	it('passes through an unrecognised but plausible division', () => {
		// Better to show a division we have not seen than to hide its results.
		expect(normalizeDivision('Open Pairs Challenger')).toBe('Open Pairs Challenger');
	});

	it('merges casing variants of an unrecognised division', () => {
		expect(normalizeDivision('JUNIOR pairs')).toBe(normalizeDivision('Junior Pairs'));
	});
});

describe('parseSeriesKey', () => {
	it('splits a ranking series key', () => {
		expect(parseSeriesKey('ranking-open')).toEqual({ type: 'ranking', division: 'open' });
		expect(parseSeriesKey('ranking-women')).toEqual({ type: 'ranking', division: 'women' });
	});

	it('splits a rating series key', () => {
		expect(parseSeriesKey('rating-open')).toEqual({ type: 'rating', division: 'open' });
	});

	it('defaults an unrecognised prefix to ranking', () => {
		expect(parseSeriesKey('something-open').type).toBe('ranking');
	});
});
