## D1: Snapshot division is the series token
date: 2026-10-11

Production manifests carry `divisionName: "Open Pairs"`, but `GET /snapshots?division=` is documented with the example `open`, the same short token that `/rankings` and `/ratings` use for points series. With the manifest value, the documented filter never matches in production. Using the token from the snapshot key (`ranking-open_2026-1-15` → `open`) makes snapshots consistent with the series they snapshot. Alternative: normalize `divisionName` to a canonical name (`Open Pairs`) — rejected because points data everywhere else in the API is keyed by token, and the filter example would still be wrong.
