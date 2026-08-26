---
key: an-optimizations-skip-condition-can-never-fire
category: landmines
load_bearing: true
scope: []
governs: .claude/skills/archive/*.mjs, .claude/skills/simplify/reverify-guard.mjs, .claude/skills/tdd/drift-reverify-guard.mjs
verified-at: 5f52ba2
last-touched: 2026-08-27
---

- **The trap.** A guard that skips expensive work when nothing relevant changed is only worth its code if the skip actually fires. Build the "did anything change" test out of the wrong signal and it answers *yes* every time. The guard is then correct, fully tested, green — and a pure cost. Nothing fails, so nothing tells you.
- **Observed 2026-08-26 on the archive re-verify guard.** Its first digest hashed every file under `docs/archive`. Every archive writes a fresh `workflow.json` and `timing.md`, so the digest moved on every single run and the guard re-verified always. Eight tests passed, including one asserting the skip — its fixture added a bundle whose files were byte-identical to an existing one, which never happens. The unit test proved the mechanism and said nothing about the frequency.
- **What caught it.** Not a test. Trying to write a tripwire for the guard's blind spot meant asking which checks actually read the archive, and the answer showed the digest was hashing bytes nothing reads while the derived envelope it needed to watch was buried among them. **Auditing the assumption is what surfaced it; the suite could not.**
- **How to avoid it.** For any skip-or-do guard, measure the skip RATE against real inputs before believing the design, and write the fixture from what the producer actually emits rather than from a default. If the skip cannot fire on an ordinary run, the honest options are to fix the signal or delete the guard and always do the work — an optimization that never optimizes is worse than no optimization, because it also has to be maintained and understood.
- **The signal is what the consumers read, never what the producer writes.** The corrected digest covers the per-track fitted envelope, archived `spec.md` paths and contents, and the set of distinct artifact filenames. It omits bundle count and paths precisely because those move every time.
- Sibling guards to check against this: `simplify/reverify-guard.mjs` and `tdd/drift-reverify-guard.mjs` share the shape. Both compare working-tree state rather than archive bytes, so neither has been shown to have this defect — that is an absence of evidence, not a measurement.
