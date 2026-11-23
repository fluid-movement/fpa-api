---
type: decision
title: Incremental sync by content hash per event
description: 'FullstackFreestyleTools has no updated_at on players, events, divisions or teams, so ''changed since'' cannot be asked. The sync manifest carries one hash per finished event (over exactly the payload sync/events returns, built by the same query so the two cannot disagree) and one hash for the player list. fpa-api polls the manifest, fetches only new or changed events in batches, drops events that left the manifest, and refetches players when their hash changes. Hashes also catch deletions and later corrections, which an updated_at column would miss for deletes. Teams carry raw player ids and players carry aliasId, so an alias merge changes only the players hash, not every event that player played in. Alternative considered: add updated_at columns and triggers to FullstackFreestyleTools — rejected: schema changes across every write path of someone else''s app, and deletes still go unseen.'
date: "2026-11-23"
issue: 01M849PHY6K1GNMYG1TVM8QYVY
---


