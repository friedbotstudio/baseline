---
key: resolved-security-findings-are-retitled-not-deleted
category: conventions
scope: [security, integrate]
governs: docs/security/**, .claude/skills/security/oracle.mjs
verified-at: 05d8fec
last-touched: 2026-08-24
---

- A finding fixed inside its own workflow is **marked resolved in place**, never deleted and never left bare. Add `- **Resolved**: <date, what changed, and the measurement that proves it>` as a bullet inside that finding's own section. The severity heading stays exactly as written, so the report keeps recording what was found at the severity it was found at.
- The reason is mechanical, not stylistic. `.claude/skills/security/oracle.mjs` emits one BLOCKER per unresolved `### [CRITICAL|HIGH]` heading, and the code-review fan-out at `/integrate` returns `BLOCKED` whatever the prose underneath says. The marker is what the oracle reads.
- **The marker is section-scoped.** It closes the finding it sits under and no other. A stray `- **Resolved**:` outside any finding silences nothing, which is what stops one resolution note from clearing an open sibling. `tests/eof-review-oracles.test.mjs` pins both directions.
- **Superseded 2026-08-24: this entry used to prescribe re-titling the heading** to `### [HIGH — RESOLVED]`, which worked because the oracle regex requires a bare `[HIGH]`. It was replaced because a suffix conflates two different facts — what was found, and what is still open — and it puts the resolution in the heading rather than beside the evidence that proves it. The heading now answers the first question and the marker answers the second.
- **The old spelling still works and no report needs migrating.** Eight archived reports carry it across three variants (`[HIGH — RESOLVED]` twice, `[MEDIUM — FIXED]` twice, `[MEDIUM — REMEDIATED]` four times); the regex has never matched any of them. A regression test pins that, so retiring the convention did not change how reports written under it are read.
- **Do not clear the gate by deleting the finding.** The report is the record of what was found; removing it destroys the history and silently converts an oracle into decoration. This clause is unchanged and is the part that actually matters.
- Same rule read the other way: if a finding is genuinely still open, leave it unmarked and let it block. The BLOCKED verdict is the feature.
- **Observed twice.** `standup-recap-single-pass` on 2026-08-13 and `staleness-witness` on 2026-08-24 both blocked on a HIGH they had already fixed and re-verified in the same cycle. The second one changed the mechanism rather than the report.
- The key still says "retitled" and stays that way on purpose. `docs/rca/2026-08-13-blind-code-review-fanout-and-census-literals.md` cites this file by path twice, and renaming it would dangle a historical record to fix a cosmetic mismatch. The first bullet is the current rule.
