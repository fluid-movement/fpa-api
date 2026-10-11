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

	const missing = CORPUS_SOURCES.filter((source) => !isObject(parsed.corpus?.[source]));
	if (missing.length > 0) {
		warnUnusable(`is missing corpus source(s): ${missing.join(', ')}`);
		return null;
	}

	return parsed.corpus!;
}

/** The sources buildIndex reads unconditionally; the rest are optional. */
const CORPUS_SOURCES = ['players', 'events', 'results', 'manifest', 'points'] as const;

function isObject(value: unknown): boolean {
	return typeof value === 'object' && value !== null;
}

function warnUnusable(reason: string): void {
	console.warn(`[snapshot] ${config.snapshotPath} ${reason}; ignoring it and refreshing from upstream`);
}
