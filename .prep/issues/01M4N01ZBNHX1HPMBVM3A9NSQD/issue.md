---
title: Stop committing dist/ build output
kind: code
---

`dist/` (compiled JS, maps and declarations) is tracked in git, yet nothing reads it from the repository: the Dockerfile builds `dist/` itself and `.dockerignore` excludes it, and `pnpm start` runs a local build. Committed build output drifts from `src/` silently and bloats diffs. Remove `dist/` from the index and add it to `.gitignore`. At survey time (2026-10-11) the committed JS matched a fresh build.

## Open questions
