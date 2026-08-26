---
key: patternsOverlap widens a single-file write_set entry to its whole directory
category: landmines
scope: [spec]
governs: .claude/hooks/lib/write-set-profile.mjs, .claude/skills/spec/optimize.mjs
load_bearing: true
source: incident
verified-at: 3c08c8a
last-touched: 2026-08-26
---

- **Trap: `patternsOverlap` in `.claude/hooks/lib/write-set-profile.mjs` calls `directoryPrefix` on BOTH sides, then compares with a bidirectional `startsWith`.** A write_set entry naming one file at a shallow directory — `.claude/CONSTITUTION.md` — reduces to `.claude/`, and every element anchored anywhere beneath it then matches.
- **Observed 2026-08-19.** `node .claude/skills/spec/cli.mjs optimize --slug roadmap-front-door` reported 113 undeclared and 117 reuse elements out of 119, on a spec whose real surface is four elements. `sprint-broker`, `cli-tui` and `env-guard` were all listed. `extractWriteSet` separately dropped `CLAUDE.md` and `README.md`, so 12 of 14 declared entries survived to reach the comparison.
- **The guard already exists next door.** `pathOverlapsWriteSet`, same file, is one-directional on purpose and its comment names this exact failure: a surface naming a single file must not match every sibling in its directory. `patternsOverlap` has no such guard.
- **Why it stayed hidden.** `spec optimize` is advisory and reported `corrections: 0`, so the run looked like a clean pass with a large advisory list rather than a broken comparison. Read the counts before the findings — a near-total undeclared rate on a small spec is the tell.
- Related: [[claude-skills-lib-argv-mjs]].
