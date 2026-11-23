---
type: decision
title: Serve finished events only; no live or in-progress data
description: The sync API lists only events that are over and locked in; fpa-api never serves an event while it is being judged. This replaces the judging-service probes (getEventDirectory, getEventDataVersion, getEventData), the pool-lock withholding and CONSUME_IN_PROGRESS_EVENTS. The exact rule for 'finished' is still open on the issue.
date: "2026-11-23"
issue: 01M849PHY6K1GNMYG1TVM8QYVY
supersedes:
  - 01M4NDB2G3KRGHT0AZJ9VQ549P
---


