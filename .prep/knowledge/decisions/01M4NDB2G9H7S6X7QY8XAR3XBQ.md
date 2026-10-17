---
type: decision
title: "Optional source, disabled without PROFILES_URL"
description: "Optional source, disabled without PROFILES_URL"
date: "2026-10-11"
issue: 01M4N2FFT6FBSGWEXR874QKGFB
---

Profiles are not upstream data and not core: without `PROFILES_URL` the source is skipped (status reports it as disabled), and a failed fetch carries the previous export forward like any non-core source. The index never fails to build because of profiles.
