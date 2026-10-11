The dump (`u399401230_8oFzc.sql`, 52 MB, MariaDB 11.8, utf8mb4) is the whole WordPress site, including users, password hashes, forum, form entries and PayPal data. It is ignored by git (`*.sql`) and must never be committed or published.

## Where the profile data lives

- **`wp_profiles`** (243 rows, 227 distinct players) holds all the profile content. The `player` custom post type (2015 posts) has no body content. Its only fields are `wpcf-player_id`, first and last name and sex. No attachments hang off player posts, and no photo paths appear in the profile rows.
- **`wp_players`** (2036 rows) is the legacy player directory: `player_id`, names, sex. `wp_profiles.player_id` and `wpcf-player_id` both reference it.
- **`wp_result_details`** (17,714 rows) holds the legacy results, already migrated upstream; out of scope.

## Profile fields (non-empty count out of 243 rows)

| Field | Filled | Notes |
| --- | --- | --- |
| `short_headline` | 242 | one-line summary |
| `description` | 169 | long bio; 3 contain HTML |
| `headline` | 1 | effectively unused |
| `nickname` | 191 | |
| `place_born` | 239 | free text, e.g. "Redwood City, California" |
| `city`, `state_etc`, `country` | 242, 77, 243 | residence |
| `height` | 235 | free text, e.g. `6' 1"` |
| `start_play_date` | 234 | usually a year |
| `how_started` | 213 | |
| `mentors`, `partners` | 192, 183 | comma-separated names, free text |
| `career_highlights` | 210 | |
| `fav_move` | 179 | |
| `profession` | 219 | |
| `other_fun` | 178 | hobbies |
| `sponsors`, `sponsor_link` | 69, 36 | |
| `user_url` | 89 | personal website, often without a scheme |
| `video_link` | 90 | mostly legacy `.wmv` URLs on dead hosts |
| `media`, `appearances` | 108, 67 | press and show appearances, some HTML |
| `majors`, `rank`, `display_rank`, `display_division`, `meet_display_order`, `country_display_order`, `show_profile_week` | various | legacy site display state, derived or obsolete |
| `user_email` | 169 | personal; do not migrate |
| `user_pass` | 243 | **plaintext passwords**; must never be migrated or logged |
| `is_this_second_profile`, `second_profile_name`, `reviewed` | | workflow flags |

Text quality is good: no mojibake and no replacement characters, 7 values with HTML entities and 4 with HTML tags.

16 players have two profile rows that differ in content (e.g. legacy players 923 and 1757). The import needs a rule; the higher `profile_id` is presumably the newer one.

## Matching legacy players to upstream players

Upstream `RawPlayer.fpaWebsiteId` is exactly `wp_players.player_id`. All 227 profiled legacy players carry one. Only 100 of them sit on the canonical upstream record, though; the rest are on alias records. Resolving the record that carries the `fpaWebsiteId` through the `aliasKey` chain maps **all 227 to exactly one canonical player**, all present in the live API (checked against localhost on 2026-10-11). No canonical player receives two legacy profiles.

Consequence: the public `/players` response only exposes the canonical record's `fpaWebsiteId`, so alias-carried legacy ids are invisible through the API. The import must either read raw upstream players and resolve aliases (as `buildPlayers` does), or the API should index legacy ids across aliases. The latter is also useful to fpa-events.

## Data quality notes

- One upstream name carries a truncated HTML entity (`Dit&` for `Dit&#283;`, i.e. Dytě), an upstream data bug.
- The legacy site's media files (`wp-content/uploads`, 4,055 references in the dump) are not part of the dump.
