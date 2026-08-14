---
key: git diff HEAD --name-only omits untracked files
category: landmines
scope: [archive, integrate]
governs: .claude/skills/workspace/delta.mjs, .claude/skills/archive/SKILL.md, .claude/skills/harness/rightsize-gate.mjs
source: incident
verified-at: 8201af6
last-touched: 2026-08-14
---

> verbatim (incident, 2026-08-08):
> The governed-path list for the archive delta was computed from `git diff HEAD --name-only` and silently omitted the one NEW file the cycle added, which would have read as a clean delta rather than a drifted one.

- Any "what did this landing touch?" list built from `git diff HEAD --name-only` covers tracked modifications only. A file created this cycle and never staged does not appear.
- The failure is silent and inverts the verdict. `/archive` Step 3 passes that list to `verifyAndApplyDelta`; a `## System delta` row claiming the new file's element resolves to `drift` — not because the work is missing, but because the evidence list never mentioned it. A row that should confirm reads as a defect, and the reverse is equally possible: a genuinely undeclared new file lands in `unclaimed: []` and looks covered.
- The fix is one extra command, unioned in: `git ls-files --others --exclude-standard`.
- Same hazard applies anywhere a phase reasons over "the diff": the right-size gate's measure, a security review's changed-file scope, and any coverage check. `git status --porcelain` reports both classes if you would rather make one call.
