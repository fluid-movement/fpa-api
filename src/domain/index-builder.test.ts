import { describe, expect, it } from 'vitest';
import { buildIndex, snapshotToPoints, type Corpus } from './index-builder.js';

function corpus(overrides: Partial<Corpus> = {}): Corpus {
	return {
		fetchedAt: 0,
		players: {
			players: {
				p1: { key: 'p1', firstName: 'Ryan', lastName: 'Young', country: 'USA' },
				p2: { key: 'p2', firstName: 'James', lastName: 'Wiseman', country: 'USA' }
			}
		},
		events: {
			allEventSummaryData: {
				e1: {
					key: 'e1',
					eventName: 'Test Event',
					startDate: '2026-05-01',
					endDate: '2026-05-03',
					additionalData: { fpaId: '999', postName: 'test-event' }
				}
			}
		},
		results: {
			results: {
				r1: {
					key: 'r1',
					eventId: 'e1',
					eventName: 'Test Event',
					divisionName: 'Open Pairs',
					resultsData: {
						round1: {
							poolA: {
								poolId: 'A',
								teamData: [
									{ players: ['p1', 'p2'], place: 1, points: 100 },
									{ players: ['p2'], place: 2, points: 50 }
								]
							}
						}
					}
				}
			}
		},
		manifest: {},
		points: {},
		...overrides
	};
}

describe('buildIndex', () => {
	it('links events to their results and divisions', () => {
		const index = buildIndex(corpus());

		const event = index.events.get('e1')!;
		expect(event.resultCount).toBe(1);
		expect(event.divisions).toEqual(['Open Pairs']);
		expect(event.fpaWebsiteId).toBe('999');
		expect(index.resultsByEvent.get('e1')).toHaveLength(1);
	});

	it('synthesizes a stub event when results reference a missing one', () => {
		// Two real records in production do this. Dropping their results would
		// silently lose an event's entire history.
		const index = buildIndex(
			corpus({ events: { allEventSummaryData: {} } })
		);

		expect(index.events.get('e1')?.name).toBe('Test Event');
		expect(index.events.get('e1')?.startDate).toBeNull();
		expect(index.warnings.some((w) => w.includes('missing from the event directory'))).toBe(true);
	});

	it('flags results it cannot use, but not hidden ones', () => {
		const index = buildIndex(
			corpus({
				results: {
					results: {
						noEvent: { key: 'noEvent', resultsData: { round1: {} } },
						noRounds: { key: 'noRounds', eventId: 'e1', resultsData: {} },
						hidden: { key: 'hidden', eventId: 'e1', resultsData: { isHidden: true } }
					}
				}
			})
		);

		expect(index.results.size).toBe(0);
		const warning = index.warnings.find((w) => w.includes('result(s) dropped'));
		expect(warning).toBe('2 result(s) dropped for having no event id or no usable rounds: noEvent, noRounds');
	});

	it('flattens placements per player, including teammates', () => {
		const index = buildIndex(corpus());

		const placements = index.placementsByPlayer.get('p1')!;
		expect(placements).toHaveLength(1);
		expect(placements[0]!.place).toBe(1);
		expect(placements[0]!.eventDate).toBe('2026-05-01');
		expect(placements[0]!.teammates.map((t) => t.fullName)).toEqual(['James Wiseman']);

		// p2 appears on two teams in the same pool.
		expect(index.placementsByPlayer.get('p2')).toHaveLength(2);
	});

	it('joins ranking points back to the events that produced them', () => {
		const index = buildIndex(
			corpus({
				points: {
					data: {
						'ranking-open': [
							{
								id: 'p1',
								fullName: 'Ryan Young',
								rank: 1,
								points: 100,
								resultsCount: 1,
								pointsList: [{ resultsId: 'r1', points: 100 }]
							}
						]
					}
				}
			})
		);

		const entry = index.rankings.get('ranking-open')!.entries[0]!;
		expect(entry.breakdown[0]).toEqual({
			resultId: 'r1',
			points: 100,
			eventId: 'e1',
			eventName: 'Test Event',
			division: 'Open Pairs'
		});
	});

	it('nulls the breakdown reference when the result no longer exists', () => {
		const index = buildIndex(
			corpus({
				points: {
					data: {
						'ranking-open': [
							{ id: 'p1', fullName: 'Ryan Young', rank: 1, points: 5, pointsList: [{ resultsId: 'gone', points: 5 }] }
						]
					}
				}
			})
		);

		expect(index.rankings.get('ranking-open')!.entries[0]!.breakdown[0]!.eventId).toBeNull();
	});

	it('keeps ratings separate from rankings and ranks them positionally', () => {
		// Ratings have a completely different shape from rankings despite
		// sharing an envelope. Merging them zeroes out every rating.
		const index = buildIndex(
			corpus({
				points: {
					data: {
						'rating-open': [
							{ id: 'p2', fullName: 'James Wiseman', rating: 1500, matchCount: 100, highestRating: 1600, highestRatingDate: '2026-4-9' },
							{ id: 'p1', fullName: 'Ryan Young', rating: 1700, matchCount: 50 }
						]
					}
				}
			})
		);

		expect(index.rankings.size).toBe(0);

		const entries = index.ratings.get('rating-open')!.entries;
		// Sorted by rating descending, ranked by position.
		expect(entries.map((e) => e.fullName)).toEqual(['Ryan Young', 'James Wiseman']);
		expect(entries[0]!.rank).toBe(1);
		expect(entries[0]!.rating).toBe(1700);
		// Upstream dates are not zero-padded; we normalize them.
		expect(entries[1]!.peakRatingDate).toBe('2026-04-09');
		expect(entries[1]!.peakRating).toBe(1600);
	});

	it('skips rating entries with no rating and warns', () => {
		const index = buildIndex(
			corpus({
				points: { data: { 'rating-open': [{ id: 'p1', fullName: 'Ryan Young' }] } }
			})
		);

		expect(index.ratings.get('rating-open')!.entries).toHaveLength(0);
		expect(index.warnings.some((w) => w.includes('skipped'))).toBe(true);
	});

	it('resolves alias ids in rankings and ratings to the canonical player', () => {
		// Upstream ranks a player under whichever GUID they were entered with,
		// duplicates included. Profiles look entries up by canonical id.
		const index = buildIndex(
			corpus({
				players: {
					players: {
						p1: { key: 'p1', firstName: 'Ryan', lastName: 'Young' },
						dupe: { key: 'dupe', firstName: 'ryan', lastName: 'young', aliasKey: 'p1' }
					}
				},
				points: {
					data: {
						'ranking-open': [{ id: 'dupe', fullName: 'Ryan Young', rank: 1, points: 10 }],
						'rating-open': [{ id: 'dupe', fullName: 'Ryan Young', rating: 1500, matchCount: 10 }]
					}
				}
			})
		);

		expect(index.rankings.get('ranking-open')!.entries[0]!.playerId).toBe('p1');
		expect(index.ratings.get('rating-open')!.entries[0]!.playerId).toBe('p1');
		expect(index.warnings.some((w) => w.includes('more than once'))).toBe(false);
	});

	it('keeps and flags a series that ranks one player under two alias ids', () => {
		const index = buildIndex(
			corpus({
				players: {
					players: {
						p1: { key: 'p1', firstName: 'Ryan', lastName: 'Young' },
						dupe: { key: 'dupe', firstName: 'ryan', lastName: 'young', aliasKey: 'p1' }
					}
				},
				points: {
					data: {
						'ranking-open': [
							{ id: 'p1', fullName: 'Ryan Young', rank: 1, points: 10 },
							{ id: 'dupe', fullName: 'Ryan Young', rank: 2, points: 5 }
						]
					}
				}
			})
		);

		expect(index.rankings.get('ranking-open')!.entries.map((e) => e.playerId)).toEqual(['p1', 'p1']);
		expect(
			index.warnings.some((w) => w.includes('"ranking-open" lists player p1 more than once'))
		).toBe(true);
	});

	it('normalizes and sorts snapshot references, excluding hidden ones', () => {
		const index = buildIndex(
			corpus({
				manifest: {
					manifest: {
						a: { key: 'ranking-open_2025-7-3', date: '2025-7-3', divisionName: 'open', createdAt: 100 },
						b: { key: 'ranking-open_2026-1-15', date: '2026-1-15', divisionName: 'open', createdAt: 200 },
						c: { key: 'rating-open_2025-1-1', date: '2025-1-1', divisionName: 'open', createdAt: 50, isHidden: true }
					}
				}
			})
		);

		expect(index.snapshots.map((s) => s.key)).toEqual([
			'ranking-open_2026-1-15',
			'ranking-open_2025-7-3'
		]);
		expect(index.snapshots[0]!.date).toBe('2026-01-15');
		expect(index.snapshots[1]!.type).toBe('ranking');
		expect(index.snapshots[1]!.division).toBe('open');
	});

	it('tracks hidden players by the canonical record and keeps them in results', () => {
		const index = buildIndex(
			corpus({
				players: {
					players: {
						p1: { key: 'p1', firstName: 'Ryan', lastName: 'Young' },
						p2: { key: 'p2', firstName: 'James', lastName: 'Wiseman', hidden: true },
						// A hidden duplicate does not hide the person it resolves to.
						dupe: { key: 'dupe', firstName: 'ryan', lastName: 'young', aliasKey: 'p1', hidden: true }
					}
				}
			})
		);

		expect([...index.hiddenPlayerIds]).toEqual(['p2']);
		expect(index.players.has('p2')).toBe(true);
		const team = index.results.get('r1')!.rounds[0]!.pools[0]!.teams[0]!;
		expect(team.players.map((m) => m.fullName)).toEqual(['Ryan Young', 'James Wiseman']);
		expect(index.placementsByPlayer.get('p2')).toHaveLength(2);
	});

	it('normalizes a historical snapshot into the series-keyed points shape', () => {
		// Regression: downloadPointsData returns a BARE ARRAY for the one series
		// its key names, unlike the series-keyed shape the index reads.
		// Feeding the array straight in produced empty rankings and ratings.
		const entries = [{ id: 'p1', fullName: 'Ryan Young', rank: 1, points: 100 }];

		expect(snapshotToPoints('ranking-open_2026-6-8', { data: entries })).toEqual({
			data: { 'ranking-open': entries }
		});

		const index = buildIndex(
			corpus({ points: snapshotToPoints('ranking-open_2026-6-8', { data: entries }) })
		);
		expect(index.rankings.get('ranking-open')!.entries[0]!.fullName).toBe('Ryan Young');
	});

	it('routes a rating snapshot to ratings, not rankings', () => {
		const points = snapshotToPoints('rating-open_2026-6-8', {
			data: [{ id: 'p1', fullName: 'Ryan Young', rating: 1700, matchCount: 10 }]
		});

		const index = buildIndex(corpus({ points }));
		expect(index.ratings.get('rating-open')!.entries).toHaveLength(1);
		expect(index.rankings.size).toBe(0);
	});

	it('passes through a snapshot payload that is already series-keyed', () => {
		const keyed = { 'ranking-open': [{ id: 'p1', rank: 1, points: 1 }] };
		expect(snapshotToPoints('ranking-open_2026-6-8', { data: keyed })).toEqual({ data: keyed });
	});

	it('tolerates a snapshot payload with no data', () => {
		expect(snapshotToPoints('ranking-open_2026-6-8', {})).toEqual({});
	});

	it('builds an empty but valid index from an empty corpus', () => {
		const index = buildIndex({
			fetchedAt: 0,
			players: {},
			events: {},
			results: {},
			manifest: {},
			points: {}
		});

		expect(index.players.size).toBe(0);
		expect(index.events.size).toBe(0);
		expect(index.hiddenPlayerIds.size).toBe(0);
	});
});
