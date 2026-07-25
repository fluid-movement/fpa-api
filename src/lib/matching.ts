/**
 * Event matching.
 *
 * fpa-events and the upstream judging system share no identifier: our legacy
 * ids come from the old Laravel site, upstream's `fpaWebsiteId` from the old
 * FPA WordPress site. So linking an event can only ever be a suggestion ranked
 * by name and date similarity, which a human then confirms.
 *
 * This intentionally does NOT auto-link. Binding the wrong results to an event
 * is worse than showing none, and only an organizer can tell the difference
 * between "German Championship 2026" and "German Championship 2026 (Juniors)".
 */

/** Words that carry no distinguishing signal in freestyle event names. */
const STOPWORDS = new Set([
	'the',
	'of',
	'and',
	'a',
	'an',
	'championship',
	'championships',
	'open',
	'tournament',
	'freestyle',
	'frisbee',
	'disc'
]);

export function tokenize(value: string): string[] {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/** Jaccard similarity over token sets: 0 (nothing shared) to 1 (identical). */
export function nameSimilarity(a: string, b: string): number {
	const left = new Set(tokenize(a));
	const right = new Set(tokenize(b));
	if (left.size === 0 || right.size === 0) return 0;

	let shared = 0;
	for (const token of left) if (right.has(token)) shared++;

	return shared / (left.size + right.size - shared);
}

/** 1.0 for the same day, decaying to 0 at 30 days apart. */
export function dateProximity(a: string | null, b: string | null): number {
	if (!a || !b) return 0;
	const left = Date.parse(a);
	const right = Date.parse(b);
	if (Number.isNaN(left) || Number.isNaN(right)) return 0;

	const days = Math.abs(left - right) / 86_400_000;
	if (days > 30) return 0;
	return 1 - days / 30;
}

export interface MatchCandidate<T> {
	item: T;
	score: number;
	nameScore: number;
	dateScore: number;
	/** True only for a near-certain match — still requires human confirmation. */
	confident: boolean;
}

/**
 * Score candidates against a name and optional date.
 *
 * Name is weighted more heavily than date: recurring annual events have very
 * similar names, but a date can legitimately be days off between a listing and
 * when results were entered.
 */
export function rankCandidates<T>(
	candidates: T[],
	query: { name: string; startDate?: string | null },
	accessors: { name: (item: T) => string; startDate: (item: T) => string | null },
	limit = 10
): Array<MatchCandidate<T>> {
	const scored = candidates
		.map((item) => {
			const nameScore = nameSimilarity(query.name, accessors.name(item));
			const dateScore = dateProximity(query.startDate ?? null, accessors.startDate(item));
			// With no date to compare, name similarity carries the whole score.
			const score = query.startDate ? nameScore * 0.7 + dateScore * 0.3 : nameScore;

			return {
				item,
				score,
				nameScore,
				dateScore,
				confident: nameScore >= 0.8 && (!query.startDate || dateScore >= 0.9)
			};
		})
		.filter((candidate) => candidate.score > 0.15)
		.sort((a, b) => b.score - a.score);

	return scored.slice(0, limit);
}
