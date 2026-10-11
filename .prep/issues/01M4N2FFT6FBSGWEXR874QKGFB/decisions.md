## D1: Profile inline on the player detail response
date: 2026-10-11

GET /players/{id} gains `profile: { fields, updatedAt } | null`. fpa-events already loads that response for its player page, so the profile arrives without a second request. The list endpoint stays lean. Keyed by canonical id, so an alias GUID request shows the same profile.

## D2: Optional source, disabled without PROFILES_URL
date: 2026-10-11

Profiles are not upstream data and not core: without `PROFILES_URL` the source is skipped (status reports it as disabled), and a failed fetch carries the previous export forward like any non-core source. The index never fails to build because of profiles.
