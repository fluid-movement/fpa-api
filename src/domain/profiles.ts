import type { RawProfilesExport } from '../upstream/types.js';
import type { Player, PlayerEnrichment, ProfileFieldValue, ProfileLink } from './types.js';

/** The fpa-profiles export envelope version this code understands. */
export const PROFILES_EXPORT_VERSION = 1;

/**
 * Attach fpa-profiles' export to canonical players.
 *
 * Values are checked by shape, not by key: a field fpa-profiles adds later
 * flows through without a change here, and which fields are public is decided
 * there. Following degrade-and-flag, a bad value drops only itself, a profile
 * whose player is gone drops only that profile, and every drop is a warning.
 */
export function buildProfiles(
	raw: RawProfilesExport | null | undefined,
	players: Map<string, Player>,
	canonicalPlayerId: Map<string, string>
): { profiles: Map<string, PlayerEnrichment>; warnings: string[] } {
	const profiles = new Map<string, PlayerEnrichment>();
	const warnings: string[] = [];
	if (!raw) return { profiles, warnings };

	if (raw.version !== PROFILES_EXPORT_VERSION || !Array.isArray(raw.profiles)) {
		warnings.push(
			`Profiles export has version ${String(raw.version)}, expected ${PROFILES_EXPORT_VERSION}; profiles ignored`
		);
		return { profiles, warnings };
	}

	const orphans: string[] = [];
	let invalidValues = 0;

	for (const entry of raw.profiles) {
		if (!entry || typeof entry.playerId !== 'string' || !isRecord(entry.fields)) {
			invalidValues += 1;
			continue;
		}

		// Stored ids were canonical when written; an upstream merge since then
		// turns them into aliases, which still resolve.
		const playerId = canonicalPlayerId.get(entry.playerId) ?? entry.playerId;
		if (!players.has(playerId)) {
			orphans.push(entry.playerId);
			continue;
		}

		const fields: Record<string, ProfileFieldValue> = {};
		for (const [key, value] of Object.entries(entry.fields)) {
			if (isFieldValue(value)) fields[key] = value;
			else invalidValues += 1;
		}

		const updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt : null;
		const existing = profiles.get(playerId);
		if (existing) {
			warnings.push(`Two profiles resolve to player ${playerId}; keeping the most recently updated`);
			if ((existing.updatedAt ?? '') >= (updatedAt ?? '')) continue;
		}
		profiles.set(playerId, { fields, updatedAt });
	}

	if (orphans.length > 0) {
		warnings.push(`${orphans.length} profile(s) reference players that no longer exist: ${orphans.join(', ')}`);
	}
	if (invalidValues > 0) {
		warnings.push(`${invalidValues} profile value(s) or entries had an unexpected shape and were dropped`);
	}

	return { profiles, warnings };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLink(value: unknown): value is ProfileLink {
	return (
		isRecord(value) &&
		typeof value.kind === 'string' &&
		typeof value.url === 'string' &&
		/^https?:\/\//i.test(value.url) &&
		(value.label === undefined || typeof value.label === 'string')
	);
}

function isFieldValue(value: unknown): value is ProfileFieldValue {
	if (typeof value === 'string') return true;
	if (!Array.isArray(value)) return false;
	return value.every((item) => typeof item === 'string') || value.every(isLink);
}
