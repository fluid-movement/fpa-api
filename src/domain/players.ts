import { config } from '../config.js';
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

function fullNameOf(raw: RawPlayer): string {
	const name = `${raw.firstName ?? ''} ${raw.lastName ?? ''}`.replace(/\s+/g, ' ').trim();
	return name.length > 0 ? name : 'Unknown Player';
}

/**
 * Walk the alias chain to its end.
 *
 * Returns the canonical id, plus a warning when the chain was broken. Never
 * recurses and never loops indefinitely, regardless of upstream data.
 *
 * On a cycle we must pick a representative that every member of that cycle also
 * picks. Simply stopping where the loop was detected does not do that: for
 * a -> b -> a, starting at `a` stops on `b` and starting at `b` stops on `a`,
 * so neither is its own canonical and BOTH players disappear from the output.
 * Taking the lexicographically smallest id in the cycle is stable regardless of
 * where the walk started, and always resolves to itself.
 */
function resolveCanonical(
	startId: string,
	raw: Record<string, RawPlayer>
): { id: string; warning: string | null } {
	const path: string[] = [startId];
	const visited = new Set<string>([startId]);
	let current = startId;

	for (;;) {
		const next = raw[current]?.aliasKey;
		if (!next) return { id: current, warning: null };

		if (visited.has(next)) {
			// Only the nodes from `next` onward form the cycle; anything before
			// it is a tail leading in, and must not influence the choice.
			const cycle = path.slice(path.indexOf(next));
			const canonical = [...cycle].sort()[0]!;
			return {
				id: canonical,
				warning:
					`Alias loop detected among players [${cycle.join(', ')}]; ` +
					`using ${canonical} as canonical. This should be fixed upstream.`
			};
		}

		if (!raw[next]) {
			return {
				id: current,
				warning: `Player ${current} aliases missing player ${next}; using ${current}`
			};
		}

		visited.add(next);
		path.push(next);
		current = next;
	}
}

export function buildPlayers(raw: Record<string, RawPlayer>): ResolvedPlayers {
	const players = new Map<string, Player>();
	const canonicalPlayerId = new Map<string, string>();
	const aliasIds = new Map<string, string[]>();
	const warnings: string[] = [];

	// Pass 1: resolve every GUID to its canonical id.
	for (const id of Object.keys(raw)) {
		const { id: canonical, warning } = resolveCanonical(id, raw);
		if (warning) warnings.push(warning);

		canonicalPlayerId.set(id, canonical);
		if (canonical !== id) {
			const list = aliasIds.get(canonical);
			if (list) list.push(id);
			else aliasIds.set(canonical, [id]);
		}
	}

	// Pass 2: materialize only the canonical players.
	for (const [id, entry] of Object.entries(raw)) {
		if (canonicalPlayerId.get(id) !== id) continue;

		players.set(id, {
			id,
			firstName: entry.firstName?.trim() ?? '',
			lastName: entry.lastName?.trim() ?? '',
			fullName: fullNameOf(entry),
			country: entry.country?.trim() || null,
			gender: config.exposePersonalFields ? (entry.gender ?? null) : null,
			membership: config.exposePersonalFields ? (entry.membership ?? null) : null,
			fpaWebsiteId: entry.fpaWebsiteId ?? null,
			aliasIds: (aliasIds.get(id) ?? []).sort(),
			createdAt: entry.createdAt ?? null,
			lastActive: entry.lastActive ?? null
		});
	}

	return { players, canonicalPlayerId, warnings };
}

/**
 * Look up a player GUID that may be an alias, may be canonical, or may be
 * entirely unknown. Callers get a usable record either way.
 */
export function lookupPlayer(
	id: string,
	players: Map<string, Player>,
	canonicalPlayerId: Map<string, string>
): { id: string; fullName: string; unknown: boolean } {
	const canonical = canonicalPlayerId.get(id) ?? id;
	const player = players.get(canonical);
	if (!player) return { id, fullName: 'Unknown Player', unknown: true };
	return { id: canonical, fullName: player.fullName, unknown: false };
}
