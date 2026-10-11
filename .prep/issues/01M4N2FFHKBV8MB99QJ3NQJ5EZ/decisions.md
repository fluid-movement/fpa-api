## D1: Separate SvelteKit editor, fpa-api pulls profiles as a source
date: 2026-10-11

The user chose option B on 2026-10-11. A small SvelteKit app with Better Auth owns the profile store and exposes a read-only JSON export. fpa-api stays read-only and database-free, and pulls the export as another source on its refresh schedule, with snapshot persistence and degrade-and-flag. The editor calls POST /refresh after saving. Rejected: Hono inside fpa-api, which breaks the read-only in-memory design and means hand-building the UI; and an admin area in fpa-events, which creates a circular dependency and couples curation to the public events site. Still open: the database engine and the repository layout.

## D2: Postgres, separate repository
date: 2026-10-11
outcome: true

Decided with the user on 2026-10-11, building on D1:

- **Database: Postgres**, as its own Coolify resource, separate from fpa-events' database so each can be restored and upgraded independently. Hetzner whole-disk backups are crash-consistent, which Postgres recovers from; Coolify scheduled dumps of this one database are available as an optional per-database restore point. It matches fpa-events (Drizzle and Better Auth on Postgres), so that setup can be copied. Rejected: SQLite (fine technically, but Coolify does not manage it and it diverges from fpa-events), MySQL and MariaDB (no advantage here).
- **Repository: a separate repository** for the editor. Coolify deploys one resource per repository. Monorepos work through a base directory and watch paths, but nothing is shared between the two apps except the JSON export contract, so a separate repository is simpler to deploy and reason about.
- **Data flow** (from D1): the editor owns the data and exposes a read-only JSON export; fpa-api pulls it as another source and validates it with its own Zod schema. The export format is the contract between the two repositories.
