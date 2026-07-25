# Integrating with fpa-events

How the SvelteKit app consumes this API.

---

## Principle

**fpa-events talks to this API server-side only.** The browser never calls it directly. That keeps
the upstream relationship behind one controlled surface, avoids CORS entirely, and lets SvelteKit
cache responses per request.

Per the fpa-events conventions in its `AGENTS.md`: use remote functions (`query()` from
`$app/server`) in colocated `data.remote.ts` files, never `+page.server.ts` actions.

## Client

A thin wrapper in `src/lib/server/results/client.ts`:

```ts
import { env } from '$env/dynamic/private';

const BASE = env.RESULTS_API_URL ?? 'http://localhost:3000';

async function get<T>(path: string, fetchFn: typeof fetch = fetch): Promise<T> {
	const response = await fetchFn(`${BASE}${path}`, {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(10_000)
	});

	if (!response.ok) {
		// 503 means the results API is still loading or upstream is down.
		// Callers should degrade gracefully rather than fail the whole page.
		throw new Error(`Results API ${response.status} for ${path}`);
	}

	return response.json() as Promise<T>;
}
```

Types can be generated from `openapi.json`, or hand-written to match — the spec is the contract
either way.

## The three features

### 1. Rankings page

`src/routes/rankings/+page.svelte` is currently a "coming soon" stub. It needs a division switcher
(`GET /rankings/series`) and the standings (`GET /rankings?series=…`).

Each ranking entry carries a `breakdown` naming the events that produced its points — that is the
detail worth surfacing on expand, and it is the thing no existing tool shows.

Consider a second tab for `GET /ratings`. **Always pass `minMatchCount`** (50-100 is sensible):
of 2265 rated players most have too few matches for the number to mean anything, and displaying
them unfiltered makes the leaderboard look broken.

### 2. Results on event pages

Requires linking an fpa-events event to an upstream event.

**Schema** — add a nullable column to `events` in `src/lib/server/db/schema.ts`:

```ts
fpaEventKey: text('fpa_event_key')
```

Then `npm run db:generate`, and update `src/lib/server/db/seed.ts` — the fpa-events convention is
that the seed script stays in sync with the schema.

**Admin linking flow**, in `src/routes/events/[id]/admin/`:

1. Call `GET /match/events?name={event.name}&startDate={event.startDate}`.
2. Show the ranked candidates with their scores and dates.
3. The admin picks one; persist `fpaEventKey`.

**Do not auto-link, even on `confident: true`.** Our events and theirs share no identifier — our
legacy ids come from the old Laravel site, theirs from the old FPA WordPress site — so matching is
inherently fuzzy. Recurring annual events with near-identical names are exactly the case that looks
confident and is wrong. `confident` means "show this one first", not "pick it".

**Rendering**, in `src/routes/events/[id]/`: when `fpaEventKey` is set, fetch
`GET /events/{fpaEventKey}/results` and render rounds → pools → teams. Hide the section entirely
when unlinked; never show an empty results table.

### 3. Dashboard metrics

Add `fpaPlayerKey` to the `user` table, linked via `GET /match/players?name=…` in account settings —
**user-confirmed**, since names in the directory are not unique.

Then `GET /players/{fpaPlayerKey}` gives everything the dashboard needs in one call: current rank
and points, Elo rating with its `matchCount`, career `stats` (events, wins, podiums, first/last
event date), and a full `placements` timeline.

---

## Rendering rules

These come from real quirks in the data. Getting them wrong produces output that is subtly and
confidently wrong.

**Sort by `place`, never by `points`.** A team's `points` means different things under different
rulesets — higher is better under FPA2020, lower is better under SimpleRanking — and the results
data does not say which was used. `place` is always reliable, always 1-is-best.

**Round 1 is the final.** Rounds count backwards, and are not contiguous. Use the `roundName` field
rather than deriving a label from the number, and never assume round 1 comes first chronologically.

**Handle `unknown: true` team members.** These are player GUIDs missing from the upstream directory.
They render as "Unknown Player" — show them rather than filtering them out, or a team of three will
silently display as two.

**Show `matchCount` next to any rating.** A rating without its sample size is misleading.

**Expect `503`.** The results API returns `503` while loading or when upstream is unavailable. An
event page must still render its own content with the results section omitted — results are
supplementary, never load-bearing.

---

## Configuration

```bash
RESULTS_API_URL=http://fpa-api:3000   # internal URL; not public
```

Since fpa-events calls this server-side, the API does not need `CORS_ORIGINS` set and does not need
to be publicly reachable at all.

## Caching

The results API already serves from memory with no per-request upstream calls, so it is fast enough
to call on every page render. If SSR latency matters, cache in fpa-events with a short TTL
(1-5 minutes) — anything longer just adds staleness on top of the API's own refresh interval.

## When results appear late

The API refreshes hourly. If an organizer enters results and wants them visible immediately, the
fix is a `POST /refresh` against the results API — worth wiring into the event admin UI as a
"refresh results" button rather than making people wait.
