---
key: audit-a-hand-authored-count-tile-against-the-derived-roster-4c1e
category: backlog
status: open
scope: [document]
governs: site-src/**, .claude/skills/audit-baseline/checks/docsite-drift.mjs
raised-on: 2026-08-25
raised-in-context: consumer-defects-2026-08-24
source: assistant-deferral
verified-at: 0336688
last-touched: 2026-08-25
---

> verbatim (assistant, 2026-08-24, during /document):
> "I am logging it for the backlog at `/memory-sync` rather than crossing it a third time — say the word if you would rather I did it now."

- **The gap.** `site-src/hooks.njk` carried a `facts:` tile reading `27` beside a roster that derives 27 from disk. The page contradicted itself for a whole cycle and every gate passed it: `roster.cjs` derives the roster, `docsite-drift.mjs` checks the derived counts, and nothing compares the hand-authored tile against them.
- **The check.** For each docsite page, compare every `facts:` tile whose label names a countable baseline thing (hooks, skills, commands, events) against the value `roster.cjs` derives. FAIL on mismatch. `audit-baseline` is the right home — it already re-derives these counts for the manifest reconciliation.
- **Why it went unseen.** The tile is the one place on that page where the number is authored rather than derived, and its comment says so. A comment naming a hazard is not a check for it. See [[governance-counts-derive-never-hardcode]] — this is that convention's unenforced edge.
- Scoped to `document` rather than `spec` because the reader who can act on it is the one writing a docsite page, which is the phase that authors these tiles.
