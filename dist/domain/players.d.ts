import type { RawPlayer } from '../upstream/types.js';
import type { Player } from './types.js';
/**
 * Player normalization and alias resolution.
 *
 * The same human can exist under several GUIDs (508 of 3138 records carry an
 * `aliasKey` pointing at their canonical entry). Chains are up to 3 deep today.
 *
 * Upstream has no referential integrity here, so three things can and do go
 * wrong, and all three must be survivable:
 *
 *   1. Loops (A -> B -> A). Upstream's own README documents these as a known
 *      defect that hangs their points generation. We resolve iteratively with a
 *      visited set so a loop degrades to one arbitrary-but-stable pick.
 *   2. Dangling aliases pointing at a GUID that no longer exists (1 in prod).
 *   3. Player GUIDs appearing in results but not in the directory (1 in prod).
 */
export interface ResolvedPlayers {
    players: Map<string, Player>;
    /** Every known GUID — canonical and alias alike — mapped to a canonical id. */
    canonicalPlayerId: Map<string, string>;
    warnings: string[];
}
export declare function buildPlayers(raw: Record<string, RawPlayer>): ResolvedPlayers;
/**
 * Look up a player GUID that may be an alias, may be canonical, or may be
 * entirely unknown. Callers get a usable record either way.
 */
export declare function lookupPlayer(id: string, players: Map<string, Player>, canonicalPlayerId: Map<string, string>): {
    id: string;
    fullName: string;
    unknown: boolean;
};
