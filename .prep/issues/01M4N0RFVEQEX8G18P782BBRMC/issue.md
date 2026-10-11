---
title: Log a corrupt or unreadable snapshot instead of ignoring it
kind: code
priority: low
---

`loadSnapshot` in `src/store/snapshot.ts` returns `null` on any error, so a missing file and a corrupt or unreadable one look identical and nothing is logged. A missing file is normal on first boot, but corruption or a permissions problem should be logged. The loaded corpus also gets no shape check before it reaches `buildIndex`.

## Open questions
