## D1: GitHub Actions
date: 2026-10-11

The repository's remote is github.com/fluid-movement/fpa-api, so CI runs on GitHub Actions. pnpm comes from pnpm/action-setup, which reads the pinned version from package.json's packageManager field, matching how the Dockerfile uses corepack.
