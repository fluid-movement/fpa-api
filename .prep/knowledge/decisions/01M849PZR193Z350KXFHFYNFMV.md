---
type: decision
title: Add a sync API to FullstackFreestyleTools ourselves and submit it as a PR
description: 'We implement what fpa-api needs as /api/v1/sync/* in FullstackFreestyleTools on our fork (fluid-movement/FullstackFreestyleTools) and submit it to SmilesAir/FullstackFreestyleTools as a PR, rather than asking Ryan to build anything. The endpoints are shaped for keeping a mirror up to date (a manifest of hashes, batched full events, the player list), not for page views; the earlier consumer-shaped branch claude/public-data-api is not reused. Rankings and ratings keep coming from the existing Points API (getManifest, downloadPointsData). Alternative considered: make the new API return the old services'' payload shapes — rejected: it would recreate their quirks (non-contiguous round keys, poola/poolA, alias chains, two points shapes) on purpose; fpa-api adapts clean payloads in its upstream layer instead.'
date: "2026-11-23"
issue: 01M849PHY6K1GNMYG1TVM8QYVY
---


