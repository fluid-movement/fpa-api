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
export declare const CANONICAL_DIVISIONS: readonly ['Open Pairs', 'Women Pairs', 'Mixed Pairs', 'Open Co-op'];
export declare const UNKNOWN_DIVISION = "Unknown";
/**
 * Map a raw division string to its canonical form.
 *
 * Unrecognised-but-plausible names (e.g. 'Open Pairs Challenger') are title-cased
 * and passed through rather than discarded — a real division we have not seen
 * before should still appear, just ungrouped.
 */
export declare function normalizeDivision(raw: string | undefined | null): string;
/**
 * Ranking series names use a short division token ('open', 'women') rather than
 * a full division name. Split e.g. 'ranking-open' into its parts.
 */
export declare function parseSeriesKey(series: string): {
    type: 'ranking' | 'rating';
    division: string;
};
