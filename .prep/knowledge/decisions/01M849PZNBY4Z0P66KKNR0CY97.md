---
type: decision
title: Keep fpa-api as the middleware between FullstackFreestyleTools and our apps
description: 'fpa-events and fpa-profiles keep calling fpa-api, not FullstackFreestyleTools directly. Reasons: we control our own API contract while the upstream changes owner and shape; the last-good snapshot keeps serving when upstream is down; fpa-profiles'' export stays merged in place; stats, alias merging and division normalization stay in one tested place; one occasional sync client is the lightest load on the upstream. Scaling, if ever needed, is a cache-header and reverse-proxy (Cloudflare) concern. Alternative considered: apps call a public data API on FullstackFreestyleTools directly and fpa-api is retired — rejected: loses control of the contract and the outage buffer, and moves our derived features into each app.'
date: "2026-11-23"
issue: 01M849PHY6K1GNMYG1TVM8QYVY
---


