---
key: .claude/skills/document/document-gate.mjs:1
category: landmarks
rests_on: zero-runtime-dependencies
load_bearing: true
scope: [document]
governs: .claude/skills/document/**,.claude/skills/prose/SKILL.md
verified-at: 7d7039c
last-touched: 2026-08-26
---

- Path: `.claude/skills/document/document-gate.mjs`, with its producer half at `.claude/skills/document/receipts.mjs`. Together they make Phase 10's routing mechanical.
- Role: the gate recomputes the required surface → delegate map from `project.json → document.surfaces` and exits 1 unless every required delegate left a receipt. `receipts.mjs` is how a delegate records that it ran. Same enforcement class as `tdd/drift_check.mjs` and `harness/rightsize-gate.mjs`: an exit code, no new hook, no new track.
- Why it exists: `/document`'s routing rule was correct, written down, and skipped anyway during Phase 10 of the workflow that shipped this file. A public page got the `documentation` style guide instead of `technical-writer`, and the two-register rule (CLAUDE.md XI.1, backlog 7b3e) never ran. Prose in a SKILL.md cannot fail a build.
- **The checker is useless without the producer.** It was first written with only the reading half, which made it an orphan that could only ever BLOCK. If you add a delegate, add its receipt call in the same edit.
- Known limitation, deliberately not fixed: the map is **page-granular, not change-granular**. A one-word fix inside a code fence draws the same obligation as a full paragraph rewrite. A false obligation is what trains people to override a gate, so this matters. Backlog: `document-gate-change-granularity`.
- Not enforced: nothing makes `/document` *call* the gate. `document/SKILL.md` step 6a instructs it and a test asserts the instruction is present, but a future run could skip the call the same way the original routing rule was skipped. Closing that needs a hook.
- Slug is validated by `assertSafeSlug` from `.claude/hooks/lib/slug.mjs` before any path is built — see the `frontmatter-values-reach-regex-and-structured-writes-unescaped` landmine for why.
