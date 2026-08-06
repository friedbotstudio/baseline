---
key: staleness-detection-is-mechanical-but-re-stamping-is-curation-4b18
category: decisions
scope: [spec, tdd, integrate]
governs: .claude/skills/workspace/digest.mjs,.claude/skills/memory-flush/stale-elements.mjs
load_bearing: true
source: assistant-deferral
verified-at: 571b6a3
last-touched: 2026-08-06
---

- **Decision.** The architecture map detects drift mechanically and repairs it by hand. `/memory-flush` Step 0c lists elements whose anchored file's exported surface has changed; a digest is re-stamped only for an element whose record and shard a curator actually reviewed. `stampAll` throws when called without an explicit id list, so no bulk-refresh entry point exists to reach for.
- **Rationale.** The obvious design is a pipeline hook that re-stamps every element on every commit. That inverts the mechanism: `classify()` goes permanently green and the drift the digest exists to catch is laundered on the way past. This system has removed exactly this shape once already — `memory-flush/SKILL.md` Step 3 records deleting the "HEAD is permanently fresh on git" semantics as a decay-evasion hatch, and open question Q-002 is the same class one register over. An auto-refresh satisfies the letter of "staleness works" while destroying its purpose.
- **Rejected: siting the detection in `/scout`.** Scout is the intuitive home and the wrong one. `spec-entry` — this repository's most-used track, including the cycle that shipped this decision — carries `scout` in `exceptions`, so a scout-sited check would almost never fire. `/memory-flush` runs on every committing track as Phase 10.7 and already has a stale-sweep step to extend.
- **The absence is the design.** `State — element honesty` in the spec has no `Stale --> Fresh` transition that does not pass through a curator. If a future cycle adds one, it has removed the feature while appearing to complete it.
- Full record: `docs/archive/2026-08-06/workspace-corpus-backfill/spec.md` §Decisions D3/D4.
- Relates to [[a-cycle-that-adds-a-gate-must-assert-the-consumer-calls-it]].
