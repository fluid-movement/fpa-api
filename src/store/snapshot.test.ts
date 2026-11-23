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

const state = {
	fetchedAt: 1,
	formatVersion: 1,
	generatedAt: '2026-11-23T10:00:00.000Z',
	events: { e1: { hash: 'h1', event: { id: 'e1', name: 'Test', divisions: [] } } },
	players: { hash: 'hp', players: [{ id: 'p1', firstName: 'Ryan', lastName: 'Young' }] },
	pointsManifest: {},
	points: {},
	profiles: null
};

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
	it('round-trips a saved sync state', async () => {
		const { saveSnapshot, loadSnapshot } = await load();
		await saveSnapshot(state);
		expect(await loadSnapshot()).toEqual(state);
	});

	it('returns null silently when there is no snapshot yet', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { loadSnapshot } = await load();
		expect(await loadSnapshot()).toBeNull();
		expect(warn).not.toHaveBeenCalled();
	});

	it.each([
		['invalid JSON', '{"version": 2, "sta', 'is not valid JSON'],
		['an unknown version', JSON.stringify({ version: 99, state }), 'has version 99'],
		[
			// What the old AWS-era service wrote: replaced by a full sync.
			'a version 1 corpus snapshot',
			JSON.stringify({ version: 1, corpus: { fetchedAt: 1, players: {}, events: {}, results: {} } }),
			'has version 1, expected 2'
		],
		[
			'a state missing parts',
			JSON.stringify({ version: 2, state: { ...state, events: undefined, points: null } }),
			'missing sync state part(s): events, points'
		],
		[
			'a state whose players are not a list',
			JSON.stringify({ version: 2, state: { ...state, players: { hash: 'hp', players: {} } } }),
			'missing sync state part(s): players'
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
