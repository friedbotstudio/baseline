---
key: optimize-overlaps-by-directory-prefix-77be
category: backlog
scope: [spec]
status: open
source: assistant-deferral
raised-on: 2026-08-10
raised-in-context: warm-context-diet
verified-at: 60c5aeb
last-touched: 2026-08-10
governs: .claude/skills/spec/optimize.mjs
---

> I left the write set accurate and noted the helper defect for the backlog rather than trimming paths to quiet the tool.

- **The defect.** `optimize.mjs → overlapsWriteSet` compares *directory prefixes*, not paths. `directoryPrefix('.claude/project.json')` returns `.claude/`, which prefix-matches every element in the corpus; `.claude/hooks/lib/resume_writer.mjs` returns `.claude/hooks/lib/`, which matches all thirty sibling libraries.
- **Measured.** On the `warm-context-diet` spec it reported **112 `undeclared` and 114 `reuse` findings, all false**. Removing the two `.claude/`-root paths from the write set took it from 112 to 68; the residue is the sibling-directory collapse. `corrections` was 0 throughout — that field is unaffected and remains trustworthy.
- **Why it matters.** The pass is advisory and blocks nothing, so the cost is not a failed gate — it is that a 112-line false-positive wall trains the author to skim past the one finding that is real. A spec whose write set legitimately names a file directly under `.claude/` can never get a clean report.
- **The fix direction.** Compare full path patterns rather than truncating to the directory, or require the overlap to be at least as specific as the element's own anchor. A file anchor and a sibling file in the same directory are not the same surface.
- **Do not "fix" it by narrowing write sets.** The write set is the spec's honest declaration of what the change touches; trimming it to quiet the tool makes the `## System delta` verification at `/archive` wrong in the opposite direction.
