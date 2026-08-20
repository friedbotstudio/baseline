---
key: both-review-oracles-interpolate-an-unsanitised-path-9e12
category: backlog
scope: [simplify, integrate]
status: open
source: assistant-deferral
raised-on: 2026-08-20
raised-in-context: changedfiles-shape-contract
verified-at: 2367f5e
last-touched: 2026-08-20
governs: .claude/skills/code-structure/oracle.mjs, .claude/skills/simplify/oracle.mjs
deferred: risk
---

> Deferred deliberately: the `/security` phase produces findings and never applies fixes.

- **The defect.** `code-structure/oracle.mjs` interpolates `file.path` into `message`, `evidence` and `artifact` with no sanitizer, and `simplify/oracle.mjs` does the same with the verdict table's file cell. `.claude/skills/lib/terminal-text.mjs` exists for exactly this, and the sibling checker `backlog-deferral.mjs` imports `clip` from it.
- **Measured.** A path `.claude/x<ESC>[2J.mjs` round-trips its control bytes into the finding message in both oracles.
- **Newly reachable in code-structure.** Before the `changedFiles` shape fix, `file.path` was `undefined` on a bare string and no finding was ever constructed. Feeding real objects made a dormant interpolation live.
- **Where it lands.** `/integrate` renders BLOCKER findings to the terminal and persists the verdict to `.claude/state/checker-fanout-code/<slug>.json`, so the review can be made to display a finding other than the one it produced.
- **Fix shape.** `import { clip } from '../lib/terminal-text.mjs'` and wrap the path at every interpolation site in both files. `tests/terminal-text.test.mjs` already asserts no consumer rolls its own control-character rule.
- **Same class, different files** as [[advisory-block-interpolates-an-unsanitised-file-path-8c7e]], which governs the two hook sites. Fix them together or the pattern survives.
