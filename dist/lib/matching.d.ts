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
export declare function tokenize(value: string): string[];
/** Jaccard similarity over token sets: 0 (nothing shared) to 1 (identical). */
export declare function nameSimilarity(a: string, b: string): number;
/** 1.0 for the same day, decaying to 0 at 30 days apart. */
export declare function dateProximity(a: string | null, b: string | null): number;
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
export declare function rankCandidates<T>(candidates: T[], query: {
    name: string;
    startDate?: string | null;
}, accessors: {
    name: (item: T) => string;
    startDate: (item: T) => string | null;
}, limit?: number): Array<MatchCandidate<T>>;
