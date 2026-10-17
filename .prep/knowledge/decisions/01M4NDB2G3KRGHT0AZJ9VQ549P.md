---
type: decision
title: "live means the event currently being judged"
description: "live means the event currently being judged"
date: "2026-10-11"
issue: 01M4N0RFN84Z4VN40QDDE870W8
---

`live` is the first event in the judging directory that the pool-lock rule classifies as in progress, or null. That is the same signal that decides withholding, so the two can never disagree, and a stale directory entry for a finished event is never reported as live. The classification is computed regardless of `CONSUME_IN_PROGRESS_EVENTS`; the flag only controls whether those events are withheld. Alternative considered: keep `live` as raw directory presence and document it — rejected because docs/UPSTREAM.md establishes that directory presence does not mean running.
