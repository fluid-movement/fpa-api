/**
 * Division name normalization.
 *
 * Upstream has no constraint on this field, so production contains `Open Pairs`
 * (898 records) alongside `Open Coop`, `open pairs`, `Open pairs`, `undefined`,
 * `Open Test` and `Results`. Rankings are grouped by division, so leaving these
 * unmerged would silently split a division's results across several buckets.
 *
 * Rule: normalize aggressively for grouping, but always keep `divisionRaw` on
 * the record so a surprising result can be traced back to what was entered.
 */

export const CANONICAL_DIVISIONS = [
	'Open Pairs',
	'Women Pairs',
	'Mixed Pairs',
	'Open Co-op'
] as const;

/**
 * Explicit overrides for values that fuzzy matching would get wrong or that we
 * want to keep verbatim. Keys are compared after lowercasing and collapsing
 * whitespace/punctuation.
 */
const OVERRIDES: Record<string, string> = {
	'open pairs': 'Open Pairs',
	'openpairs': 'Open Pairs',
	'open': 'Open Pairs',
	'women pairs': 'Women Pairs',
	'womenpairs': 'Women Pairs',
	'women': 'Women Pairs',
	'mixed pairs': 'Mixed Pairs',
	'mixedpairs': 'Mixed Pairs',
	'mixed': 'Mixed Pairs',
	'open co op': 'Open Co-op',
	'open coop': 'Open Co-op',
	'opencoop': 'Open Co-op',
	'co op': 'Open Co-op',
	'coop': 'Open Co-op'
};

/** Values that are data-entry noise rather than a real division. */
const UNKNOWN_MARKERS = new Set(['', 'undefined', 'null', 'results', 'test']);

export const UNKNOWN_DIVISION = 'Unknown';

function fold(value: string): string {
	return value
		.toLowerCase()
		.replace(/[-_]+/g, ' ')
		.replace(/[^a-z0-9 ]+/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Map a raw division string to its canonical form.
 *
 * Unrecognised-but-plausible names (e.g. 'Open Pairs Challenger') are title-cased
 * and passed through rather than discarded — a real division we have not seen
 * before should still appear, just ungrouped.
 */
export function normalizeDivision(raw: string | undefined | null): string {
	if (raw == null) return UNKNOWN_DIVISION;

	const folded = fold(raw);
	if (UNKNOWN_MARKERS.has(folded)) return UNKNOWN_DIVISION;

	const override = OVERRIDES[folded];
	if (override) return override;

	// Unknown but meaningful: title-case it so casing variants still merge.
	return folded
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * Ranking series names use a short division token ('open', 'women') rather than
 * a full division name. Split e.g. 'ranking-open' into its parts.
 */
export function parseSeriesKey(series: string): {
	type: 'ranking' | 'rating';
	division: string;
} {
	const [typePart, ...rest] = series.split('-');
	const type = typePart === 'rating' ? 'rating' : 'ranking';
	const division = rest.join('-') || 'open';
	return { type, division };
}
