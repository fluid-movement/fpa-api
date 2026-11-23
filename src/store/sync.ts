import type { Corpus } from '../domain/index-builder.js';
import { adaptEvents, adaptLatestPoints, adaptPlayers } from '../upstream/adapter.js';
import type {
	RawManifestResponse,
	RawPointsSnapshotResponse,
	RawProfilesExport,
	SyncEvent,
	SyncManifest,
	SyncPlayer
} from '../upstream/types.js';

/**
 * The raw mirror of upstream that a sync maintains and the snapshot persists.
 *
 * It is kept in the sync API's own shapes, with the hashes they were fetched
 * under, so the next sync can ask for only what changed. `toCorpus` derives the
 * normalizers' input from it; nothing derived is stored.
 */
export interface SyncState {
	/** When the sync API was last read successfully (the data's honest age). */
	fetchedAt: number;
	formatVersion: number;
	/** The sync manifest's own `generatedAt`, as upstream reported it. */
	generatedAt: string | null;
	/** Every finished event, keyed by id, with the manifest hash it was fetched under. */
	events: Record<string, { hash: string; event: SyncEvent }>;
	players: { hash: string; players: SyncPlayer[] };
	/** `points/getManifest`, `createdAt` normalized to epoch ms. */
	pointsManifest: RawManifestResponse;
	/** Each series' latest snapshot, keyed by series ('ranking-open'). */
	points: Record<string, { key: string; payload: RawPointsSnapshotResponse }>;
	profiles: RawProfilesExport | null;
}

/** The sync API payload format this client understands. */
export const SUPPORTED_FORMAT_VERSION = 1;

export interface SyncPlan {
	/** New events and events whose hash changed, sorted. */
	fetchEvents: string[];
	/** Stored events that are no longer in the manifest. */
	removeEvents: string[];
	fetchPlayers: boolean;
	/** Series -> latest key, for series whose latest key changed (or are new). */
	fetchPoints: Record<string, string>;
	/** Stored series that no longer have a visible snapshot. */
	removePoints: string[];
}

/**
 * Decide what a sync has to fetch, from the stored state and the two manifests.
 *
 * Pure. `latestPoints` is null when the points manifest could not be read, in
 * which case the stored points are left as they are.
 */
export function planSync(
	previous: Pick<SyncState, 'events' | 'players' | 'points'> | null,
	manifest: { events: Record<string, string>; players: { hash: string } },
	latestPoints: Record<string, string> | null
): SyncPlan {
	const stored = previous?.events ?? {};

	const fetchEvents = Object.entries(manifest.events)
		.filter(([id, hash]) => stored[id]?.hash !== hash)
		.map(([id]) => id)
		.sort();
	const removeEvents = Object.keys(stored)
		.filter((id) => !(id in manifest.events))
		.sort();

	const fetchPlayers = previous === null || previous.players.hash !== manifest.players.hash;

	const fetchPoints: Record<string, string> = {};
	const removePoints: string[] = [];
	if (latestPoints) {
		const storedPoints = previous?.points ?? {};
		for (const [series, key] of Object.entries(latestPoints)) {
			if (storedPoints[series]?.key !== key) fetchPoints[series] = key;
		}
		for (const series of Object.keys(storedPoints)) {
			if (!(series in latestPoints)) removePoints.push(series);
		}
		removePoints.sort();
	}

	return { fetchEvents, removeEvents, fetchPlayers, fetchPoints, removePoints };
}

/** True when the plan fetches or drops nothing at all. */
export function isEmptyPlan(plan: SyncPlan): boolean {
	return (
		plan.fetchEvents.length === 0 &&
		plan.removeEvents.length === 0 &&
		!plan.fetchPlayers &&
		Object.keys(plan.fetchPoints).length === 0 &&
		plan.removePoints.length === 0
	);
}

/**
 * Check the parts of a sync manifest the client relies on. Returns the
 * manifest narrowed, or throws with a message fit for /health.
 */
export function validateManifest(manifest: SyncManifest): {
	formatVersion: number;
	generatedAt: string | null;
	players: { hash: string; count: number | null };
	events: Record<string, string>;
} {
	if (manifest?.formatVersion !== SUPPORTED_FORMAT_VERSION) {
		throw new Error(
			`Unsupported sync formatVersion ${String(manifest?.formatVersion)}, expected ${SUPPORTED_FORMAT_VERSION}`
		);
	}
	if (typeof manifest.players?.hash !== 'string') {
		throw new Error('Sync manifest has no players hash');
	}
	const events = manifest.events;
	if (!events || typeof events !== 'object' || Array.isArray(events)) {
		throw new Error('Sync manifest has no events map');
	}
	for (const [id, hash] of Object.entries(events)) {
		if (typeof hash !== 'string') throw new Error(`Sync manifest has a non-string hash for event ${id}`);
	}

	return {
		formatVersion: manifest.formatVersion,
		generatedAt: typeof manifest.generatedAt === 'string' ? manifest.generatedAt : null,
		players: {
			hash: manifest.players.hash,
			count: typeof manifest.players.count === 'number' ? manifest.players.count : null
		},
		events
	};
}

/**
 * Merge fetched events into the stored ones.
 *
 * Every id in `requested` was asked for; one that did not come back has left
 * the finished set between the manifest and the fetch, and is treated as gone.
 * Its stored copy is dropped too, so a stale version is never served.
 */
export function mergeEvents(
	stored: SyncState['events'],
	plan: Pick<SyncPlan, 'fetchEvents' | 'removeEvents'>,
	manifestEvents: Record<string, string>,
	fetched: SyncEvent[]
): { events: SyncState['events']; missing: string[] } {
	const events = { ...stored };
	for (const id of plan.removeEvents) delete events[id];

	const returned = new Map<string, SyncEvent>();
	for (const event of fetched) {
		if (event?.id && !returned.has(event.id)) returned.set(event.id, event);
	}

	const missing: string[] = [];
	for (const id of plan.fetchEvents) {
		const event = returned.get(id);
		if (event) {
			events[id] = { hash: manifestEvents[id]!, event };
		} else {
			delete events[id];
			missing.push(id);
		}
	}

	return { events, missing };
}

/** The normalizers' input, derived from the sync state through the adapter. */
export function toCorpus(state: SyncState): Corpus {
	const { events, results } = adaptEvents(Object.values(state.events).map((entry) => entry.event));
	return {
		fetchedAt: state.fetchedAt,
		players: adaptPlayers(state.players.players),
		events,
		results,
		manifest: state.pointsManifest,
		points: adaptLatestPoints(state.points),
		profiles: state.profiles
	};
}

/** Split ids into batches the sync API accepts. */
export function batches<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}
