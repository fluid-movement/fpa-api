import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// config reads SNAPSHOT_PATH at import time, so each test points it at a fresh
// temporary file and re-imports the module.
let dir: string;
let path: string;

async function load() {
	vi.resetModules();
	vi.stubEnv('SNAPSHOT_PATH', path);
	return import('./snapshot.js');
}

const corpus = { fetchedAt: 1, players: {}, events: {}, results: {}, manifest: {}, points: {}, directory: null };

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'fpa-snapshot-'));
	path = join(dir, 'snapshot.json');
});

afterEach(async () => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	await rm(dir, { recursive: true, force: true });
});

describe('loadSnapshot', () => {
	it('round-trips a saved corpus', async () => {
		const { saveSnapshot, loadSnapshot } = await load();
		await saveSnapshot(corpus);
		expect(await loadSnapshot()).toEqual(corpus);
	});

	it('returns null silently when there is no snapshot yet', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { loadSnapshot } = await load();
		expect(await loadSnapshot()).toBeNull();
		expect(warn).not.toHaveBeenCalled();
	});

	it.each([
		['invalid JSON', '{"version": 1, "corp', 'is not valid JSON'],
		['an unknown version', JSON.stringify({ version: 99, corpus }), 'has version 99'],
		[
			'a corpus missing sources',
			JSON.stringify({ version: 1, corpus: { ...corpus, results: undefined, points: null } }),
			'missing corpus source(s): results, points'
		]
	])('warns and returns null for %s', async (_case, contents, message) => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await writeFile(path, contents, 'utf8');
		const { loadSnapshot } = await load();
		expect(await loadSnapshot()).toBeNull();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining(message));
	});

	it('warns and returns null when the path cannot be read', async () => {
		// A directory where the file should be: EISDIR, not a first boot.
		await mkdir(path);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { loadSnapshot } = await load();
		expect(await loadSnapshot()).toBeNull();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not be read'));
	});
});
