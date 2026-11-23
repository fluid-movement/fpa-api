import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';
import type { SyncState } from './sync.js';

/**
 * Last-good sync state persistence.
 *
 * Without this, a restart during an upstream outage leaves us serving nothing.
 * With it, we boot from disk immediately and treat the network sync as a
 * refresh rather than a hard dependency. It also carries the hashes the next
 * sync compares against, so a restart does not cost a full resync.
 *
 * We store the RAW sync payloads, not the derived index: normalization logic
 * changes far more often than upstream data does, and a snapshot of derived
 * output would quietly serve yesterday's bugs after a deploy.
 *
 * Version 1 held the old AWS services' corpus. It is ignored with a warning
 * and replaced by a full sync.
 */

const SNAPSHOT_VERSION = 2;

interface SnapshotFile {
	version: number;
	state: SyncState;
}

export async function saveSnapshot(state: SyncState): Promise<void> {
	const payload: SnapshotFile = { version: SNAPSHOT_VERSION, state };
	await mkdir(dirname(config.snapshotPath), { recursive: true });

	// Write-then-rename: a crash mid-write must not leave a truncated snapshot
	// that then fails to parse on the next boot.
	const temp = `${config.snapshotPath}.tmp`;
	await writeFile(temp, JSON.stringify(payload), 'utf8');
	await rename(temp, config.snapshotPath);
}

export async function loadSnapshot(): Promise<SyncState | null> {
	let raw: string;
	try {
		raw = await readFile(config.snapshotPath, 'utf8');
	} catch (error) {
		// A missing snapshot is the expected first-boot state. Anything else
		// (permissions, a directory in the way) means the volume is misconfigured.
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			warnUnusable(`could not be read: ${(error as Error).message}`);
		}
		return null;
	}

	let parsed: Partial<SnapshotFile>;
	try {
		parsed = JSON.parse(raw) as Partial<SnapshotFile>;
	} catch (error) {
		warnUnusable(`is not valid JSON: ${(error as Error).message}`);
		return null;
	}

	if (parsed?.version !== SNAPSHOT_VERSION) {
		warnUnusable(`has version ${String(parsed?.version)}, expected ${SNAPSHOT_VERSION}`);
		return null;
	}

	const state = parsed.state;
	const missing = STATE_PARTS.filter((part) => !isObject(state?.[part]));
	if (state && isObject(state.players) && !Array.isArray(state.players.players)) missing.push('players');
	if (missing.length > 0) {
		warnUnusable(`is missing sync state part(s): ${[...new Set(missing)].join(', ')}`);
		return null;
	}

	return state!;
}

/** The parts a restored state cannot do without; profiles are optional. */
const STATE_PARTS: Array<keyof SyncState> = ['events', 'players', 'pointsManifest', 'points'];

function isObject(value: unknown): boolean {
	return typeof value === 'object' && value !== null;
}

function warnUnusable(reason: string): void {
	console.warn(`[snapshot] ${config.snapshotPath} ${reason}; ignoring it and refreshing from upstream`);
}
