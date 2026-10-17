---
type: decision
title: "Profile inline on the player detail response"
description: "Profile inline on the player detail response"
date: "2026-10-11"
issue: 01M4N2FFT6FBSGWEXR874QKGFB
---

GET /players/{id} gains `profile: { fields, updatedAt } | null`. fpa-events already loads that response for its player page, so the profile arrives without a second request. The list endpoint stays lean. Keyed by canonical id, so an alias GUID request shows the same profile.
