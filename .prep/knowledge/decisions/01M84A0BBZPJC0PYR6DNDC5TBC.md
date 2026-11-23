---
type: decision
title: Adapt sync payloads into the existing Raw* types first
description: fpa-api's new upstream layer converts sync payloads into the existing Raw* corpus types, so the domain normalizers and their tests stay untouched and the change is confined to upstream, store, scheduler, snapshot and config. Simplifying the Raw* types to the clean sync shapes is a later, separate step.
date: "2026-11-23"
issue: 01M849PHY6K1GNMYG1TVM8QYVY
---


