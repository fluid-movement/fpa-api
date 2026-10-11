---
title: Compare the refresh token in constant time
kind: code
priority: low
---

`POST /refresh` in `src/routes/admin.ts` compares the bearer token with `!==`, which leaks timing information. Use `crypto.timingSafeEqual` (on equal-length buffers, or by comparing hashes).

## Open questions
