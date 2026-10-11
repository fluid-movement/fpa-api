---
title: Index.live reports an event regardless of its lock state
kind: code
---

`buildIndex` sets `live` from `corpus.directory.eventDirectory[0]` (`src/domain/index-builder.ts:395`) without consulting `liveLocks`. Per docs/UPSTREAM.md, presence in the event directory is not the finished signal. A stale directory entry for a finished event is still reported as live, and the reported live event may be the same one the index withholds as in progress. Decide what `live` should mean and derive it consistently with the pool-lock gating.

## Open questions
