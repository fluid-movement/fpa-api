import { describe, expect, it, vi } from 'vitest';
import {
	buildIndex,
	snapshotToPoints,
	summarizePoolLocks,
	type Corpus
} from './index-builder.js';

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
		directory: null,
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
	});

	it('exposes the live event from the directory', () => {
		const index = buildIndex(
			corpus({
				directory: { eventDirectory: [{ eventKey: 'e1', eventName: 'Test Event', modifiedAt: 123 }] }
			})
		);

		expect(index.live).toEqual({ eventId: 'e1', eventName: 'Test Event', modifiedAt: 123 });
	});

	// Events still being judged are withheld whole. The signal is per-pool
	// `isLocked` from the judging service, NOT presence in the directory:
	// upstream's `showInDirectory` is cleared by a manual admin call and in
	// production stays true for weeks after an event has ended.
	describe('in-progress events', () => {
		const directory = {
			eventDirectory: [{ eventKey: 'e1', eventName: 'Test Event', modifiedAt: 123 }]
		};

		const locks = (allPoolsLocked: boolean, unlockedCount: number) => ({
			e1: { allPoolsLocked, poolCount: 4, unlockedCount, observedAt: 0 }
		});

		it('consumes a directoried event once every pool is locked', () => {
			const index = buildIndex(
				corpus({ directory, liveLocks: locks(true, 0) })
			);

			expect(index.events.has('e1')).toBe(true);
			expect(index.results.has('r1')).toBe(true);
			expect(index.events.get('e1')!.resultCount).toBe(1);
		});

		it('withholds the event and its results while a pool is unlocked', () => {
			const index = buildIndex(
				corpus({ directory, liveLocks: locks(false, 2) })
			);

			expect(index.events.has('e1')).toBe(false);
			expect(index.results.has('r1')).toBe(false);
			expect(index.resultsByEvent.has('e1')).toBe(false);
			expect(index.placementsByPlayer.get('p1') ?? []).toHaveLength(0);
			expect(index.warnings).toContainEqual(
				expect.stringContaining('is being judged — 2 of 4 pool(s) unlocked')
			);
		});

		it('does not resurrect a withheld event as a synthesized stub', () => {
			// The stub-synthesis pass walks resultsByEvent and invents an event
			// for any id it does not recognise. Filtering the results first is
			// what stops it handing the withheld event straight back.
			const index = buildIndex(
				corpus({ directory, liveLocks: locks(false, 1) })
			);

			expect(index.events.size).toBe(0);
			expect(index.warnings).not.toContainEqual(
				expect.stringContaining('missing from the event directory')
			);
		});

		it('consumes a directoried event that has ended when lock state is unknown', () => {
			// A judging-service outage must not drop a finished event's
			// complete results. e1 ended 2026-05-03.
			const index = buildIndex(corpus({ directory, liveLocks: undefined }));

			expect(index.events.has('e1')).toBe(true);
			expect(index.results.has('r1')).toBe(true);
		});

		it('withholds a directoried event that has not ended when lock state is unknown', () => {
			const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
			const base = corpus({ directory });
			base.events.allEventSummaryData!.e1!.endDate = future;

			const index = buildIndex(base);

			expect(index.events.has('e1')).toBe(false);
			expect(index.warnings).toContainEqual(
				expect.stringContaining('no observed pool lock state')
			);
		});

		it('withholds a directoried event with no end date when lock state is unknown', () => {
			const base = corpus({ directory });
			delete base.events.allEventSummaryData!.e1!.endDate;

			expect(buildIndex(base).events.has('e1')).toBe(false);
		});

		it('treats an event with no pools at all as still in progress', () => {
			expect(
				summarizePoolLocks({ eventData: { eventData: { poolMap: {} } } }).allPoolsLocked
			).toBe(false);
			expect(summarizePoolLocks({}).allPoolsLocked).toBe(false);
		});

		it('summarizes a mixed pool map', () => {
			const summary = summarizePoolLocks({
				eventData: {
					eventData: {
						poolMap: {
							'pool|e1|Open Pairs|Finals|A': { isLocked: true },
							'pool|e1|Open Pairs|Semifinals|A': { isLocked: false },
							'pool|e1|Open Pairs|Semifinals|B': {}
						}
					}
				}
			});

			expect(summary).toMatchObject({
				allPoolsLocked: false,
				poolCount: 3,
				unlockedCount: 2
			});
		});

		it('consumes in-progress events when the escape hatch is set', async () => {
			vi.resetModules();
			vi.stubEnv('CONSUME_IN_PROGRESS_EVENTS', 'true');
			const { buildIndex: build } = await import('./index-builder.js');

			const index = build(corpus({ directory, liveLocks: locks(false, 2) }));

			expect(index.events.has('e1')).toBe(true);
			expect(index.results.has('r1')).toBe(true);

			vi.unstubAllEnvs();
			vi.resetModules();
		});
	});

	it('normalizes a historical snapshot into the live points shape', () => {
		// Regression: downloadPointsData returns a BARE ARRAY for the one series
		// its key names, unlike downloadLatestPointsData which keys by series.
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
			points: {},
			directory: null
		});

		expect(index.players.size).toBe(0);
		expect(index.events.size).toBe(0);
		expect(index.live).toBeNull();
	});
});
