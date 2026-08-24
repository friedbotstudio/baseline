---
key: an-epic-spec-cannot-be-scored-against-its-own-landing-commit
category: landmines
scope: [spec, implement, integrate]
governs: .claude/skills/tdd/drift_check.mjs, .claude/skills/harness/SKILL.md
verified-at: 05d8fec
last-touched: 2026-08-24
---

- Landmine: **an `epic` spec's landing commit carries discovery ONLY. Its promises land later, in its children's commits. Any oracle that scores "a spec against the commit that landed it" reports an epic as broken and is measuring the track's shape rather than the code.**

**Measured 2026-08-13.** The first live run of `sweepArchivedSpecs` returned 8 unresolved rows out of 516 — every one from `docs/archive/2026-08-07/system-spec-delta/spec.md`, which carries six `## Slice` headings. With epics excluded: 483 rows, 0 unresolved. The apparent 1.6% false-positive rate was entirely this.

- **Why it is structural, not a bug.** The `epic` track runs `intake → scout → research → spec → approve-direction → memory-sync → commit` and has no implementation phases at all; `harness/SKILL.md` states it outright. The commit that adds the sliced spec is *supposed* to contain nothing but discovery.
- **The detector is the slice heading.** `/^##\s+Slice\s+\S/m` over the spec text. Five archived specs match today. Any new oracle over archived specs needs the same exclusion — this will not be the last one.
- **Exclude visibly, never silently.** Report the count you dropped (`epicsSkipped`) and assert it against the live number of sliced specs. A sweep that quietly skips five specs reads as "everything passed" while covering less every time an epic lands, which is the silent-cap shape this repo has a standing rule against.
- **Do not "fix" it by scoring an epic against its children's commits.** The boundary is fuzzy (which later commits count?) and the epic's own ACs are already scored per-child at each `epic-child` drift tick. The exclusion is the correct answer, not a shortcut.
- Related: [[a-checker-aimed-one-axis-off-passes-loudly]] — the sweep was aimed at "specs" when the population it can actually judge is "specs whose work landed in one commit".
