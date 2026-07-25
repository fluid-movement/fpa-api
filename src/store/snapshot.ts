import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';
import type { Corpus } from '../domain/index-builder.js';

/**
 * Last-good corpus persistence.
 *
 * Without this, a restart during an upstream outage leaves us serving nothing.
 * With it, we boot from disk immediately and treat the network fetch as a
 * refresh rather than a hard dependency.
 *
 * We store the RAW corpus, not the derived index: normalization logic changes
 * far more often than upstream data does, and a snapshot of derived output
 * would quietly serve yesterday's bugs after a deploy.
 */

const SNAPSHOT_VERSION = 1;

interface SnapshotFile {
	version: number;
	corpus: Corpus;
}

export async function saveSnapshot(corpus: Corpus): Promise<void> {
	const payload: SnapshotFile = { version: SNAPSHOT_VERSION, corpus };
	await mkdir(dirname(config.snapshotPath), { recursive: true });

	// Write-then-rename: a crash mid-write must not leave a truncated snapshot
	// that then fails to parse on the next boot.
	const temp = `${config.snapshotPath}.tmp`;
	await writeFile(temp, JSON.stringify(payload), 'utf8');
	await rename(temp, config.snapshotPath);
}

export async function loadSnapshot(): Promise<Corpus | null> {
	try {
		const raw = await readFile(config.snapshotPath, 'utf8');
		const parsed = JSON.parse(raw) as SnapshotFile;
		if (parsed.version !== SNAPSHOT_VERSION) return null;
		return parsed.corpus;
	} catch {
		// Missing or unreadable snapshot is an expected first-boot state.
		return null;
	}
}
