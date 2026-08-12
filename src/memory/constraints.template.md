---
owners: [/memory-sync]
category: facts about the world the project builds around
size-cap: 500
key: <slug>
verifies-against: state_verified_at
stale-exempt: false
---

# Constraints

(populated by /memory-sync from auto-extracted candidates)

Each entry records a fact about the environment the project must build around, plus
whether that fact still holds. `state: true` means the constraint HOLDS.
`state_verified_at:` records when someone last checked — that is the field which
goes stale, so entries in this category do age out.

A flip invalidates every decision resting on the constraint, so `/spec` and
`/scout` re-verify an entry before citing it.
