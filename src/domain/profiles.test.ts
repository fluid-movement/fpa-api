import { describe, expect, it } from 'vitest';
import { buildPlayers } from './players.js';
import { buildProfiles } from './profiles.js';

const { players, canonicalPlayerId } = buildPlayers({
	p1: { key: 'p1', firstName: 'Larry', lastName: 'Imperiale' },
	dupe: { key: 'dupe', firstName: 'larry', lastName: 'imperiale', aliasKey: 'p1' },
	p2: { key: 'p2', firstName: 'Ryan', lastName: 'Young' }
});

const build = (raw: Parameters<typeof buildProfiles>[0]) => buildProfiles(raw, players, canonicalPlayerId);

describe('buildProfiles', () => {
	it('attaches every value shape the export uses, including keys it does not know yet', () => {
		const { profiles, warnings } = build({
			version: 1,
			profiles: [
				{
					playerId: 'p1',
					updatedAt: '2026-10-11T09:30:10.275Z',
					fields: {
						nickname: 'Laerbs',
						someFutureField: ['Skippy Jammer', 'John Jewell'],
						links: [{ kind: 'website', url: 'https://coloradopowder.com', label: 'Colorado Powder' }]
					}
				}
			]
		});

		expect(warnings).toEqual([]);
		expect(profiles.get('p1')).toEqual({
			updatedAt: '2026-10-11T09:30:10.275Z',
			fields: {
				nickname: 'Laerbs',
				someFutureField: ['Skippy Jammer', 'John Jewell'],
				links: [{ kind: 'website', url: 'https://coloradopowder.com', label: 'Colorado Powder' }]
			}
		});
	});

	it('resolves a profile stored under an id that has since become an alias', () => {
		const { profiles } = build({ version: 1, profiles: [{ playerId: 'dupe', fields: { nickname: 'Laerbs' } }] });
		expect(profiles.get('p1')?.fields).toEqual({ nickname: 'Laerbs' });
	});

	it('drops and flags values with an unexpected shape, keeping the rest', () => {
		const { profiles, warnings } = build({
			version: 1,
			profiles: [
				{
					playerId: 'p1',
					fields: {
						nickname: 'Laerbs',
						number: 42,
						links: [{ kind: 'website', url: 'javascript:alert(1)' }],
						mixed: ['text', { kind: 'website', url: 'https://example.com' }]
					}
				}
			]
		});

		expect(profiles.get('p1')?.fields).toEqual({ nickname: 'Laerbs' });
		expect(warnings).toEqual(['3 profile value(s) or entries had an unexpected shape and were dropped']);
	});

	it('flags profiles whose player no longer exists', () => {
		const { profiles, warnings } = build({ version: 1, profiles: [{ playerId: 'gone', fields: { nickname: 'X' } }] });
		expect(profiles.size).toBe(0);
		expect(warnings).toEqual(['1 profile(s) reference players that no longer exist: gone']);
	});

	it('keeps the newest when two profiles land on one player after a merge', () => {
		const { profiles, warnings } = build({
			version: 1,
			profiles: [
				{ playerId: 'p1', updatedAt: '2026-01-01T00:00:00Z', fields: { nickname: 'old' } },
				{ playerId: 'dupe', updatedAt: '2026-06-01T00:00:00Z', fields: { nickname: 'new' } }
			]
		});
		expect(profiles.get('p1')?.fields.nickname).toBe('new');
		expect(warnings).toEqual(['Two profiles resolve to player p1; keeping the most recently updated']);
	});

	it('ignores an export with an unknown version, and nothing at all when the source is off', () => {
		expect(build({ version: 2, profiles: [] }).warnings).toEqual([
			'Profiles export has version 2, expected 1; profiles ignored'
		]);
		expect(build(null)).toEqual({ profiles: new Map(), warnings: [] });
	});
});
