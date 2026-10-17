---
type: decision
title: "Separate SvelteKit editor, fpa-api pulls profiles as a source"
description: "Separate SvelteKit editor, fpa-api pulls profiles as a source"
date: "2026-10-11"
issue: 01M4N2FFHKBV8MB99QJ3NQJ5EZ
---

The user chose option B on 2026-10-11. A small SvelteKit app with Better Auth owns the profile store and exposes a read-only JSON export. fpa-api stays read-only and database-free, and pulls the export as another source on its refresh schedule, with snapshot persistence and degrade-and-flag. The editor calls POST /refresh after saving. Rejected: Hono inside fpa-api, which breaks the read-only in-memory design and means hand-building the UI; and an admin area in fpa-events, which creates a circular dependency and couples curation to the public events site. Still open: the database engine and the repository layout.
