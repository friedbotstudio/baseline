---
key: swarm-wave-audit-collapses-untracked-dirs-4c19
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-09
raised-in-context: read-front-door-sweep
verified-at: 7f7b582
last-touched: 2026-08-09
governs: .claude/skills/swarm-dispatch/swarm_wave_audit.mjs
---

> The audit fails — but on a path shape, not a stray write. `git status --porcelain` collapses a new untracked directory to `.claude/skills/roadmap/`, which never string-matches the file entry in the union.

- **The defect.** `swarm_wave_audit.mjs:72` runs `git status --porcelain` without `-uall`. Git reports a wholly-new untracked DIRECTORY as one collapsed path (`.claude/skills/roadmap/`), never as its files. The audit then compares that directory string against a union write_set that lists FILES, finds no match, and reports AUDIT FAIL naming a path no task claimed.
- **Why it matters.** Any swarm task that creates a new directory false-fails its wave audit. The SOP's instruction on FAIL is "treat the wave as failed: stop, surface, do not advance" — so a correct plan is halted by a measurement error, and the operator either overrides the oracle (eroding it) or re-plans work that was never wrong.
- **Observed.** Twice in one cycle, waves 1 and 2 of `read-front-door-sweep`. Both times the corrected measurement (`git status --porcelain -uall` minus `pre_wave_changed`) showed every changed path inside the union and zero outside.
- **The fix.** Add `-uall` to the `spawnSync` args at line 72 so untracked directories expand to files before comparison. One flag.
- **Not fixed in that cycle** because `swarm_wave_audit.mjs` was outside the approved write set, and widening scope mid-wave is what the boundary guard exists to prevent.
