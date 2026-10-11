## D1: List field plus a filter on /players
date: 2026-10-11

Players get `fpaWebsiteIds`, every legacy id across the canonical record and its aliases, and `GET /players?fpaWebsiteId=` matches any of them. The existing `fpaWebsiteId` stays as is for compatibility. A dedicated lookup endpoint was rejected: the filter reuses the list's pagination and response shape, and the result is usually one player.
