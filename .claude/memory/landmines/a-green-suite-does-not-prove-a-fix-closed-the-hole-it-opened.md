---
key: a-green-suite-does-not-prove-a-fix-closed-the-hole-it-opened
category: landmines
scope: [scout, spec, tdd, security, integrate]
verified-at: 1414f27
last-touched: 2026-07-13
---

- Path: `.claude/skills/security/SKILL.md` (read-only by contract; fixes route through `/tdd`) + the phase ordering in `.claude/workflows.jsonl`.
- Trap: when `/security` raises a finding and the fix lands, the **fix's own tests passing is not evidence the fix is safe**. A remediation can close the reported hole and open a new one in the same edit, and neither the new tests nor the full suite will notice — they assert what the fix was *meant* to do, not what it *also* did.
- Live 2026-07-13 (`extractor-noise-and-prereq-drift`, T1): `/security` reported that `stripSkillEnvelope` discarded whole blocks (a real deferral was lost beside a pasted SOP marker). The fix returned the text at/below any `ARGUMENTS:` marker. **Its tests passed. All 1618 tests passed.** But an `ARGUMENTS:` line planted BEFORE the SOP marker made `argsAt = 0`, so `slice(0)` returned the whole block — contract prose included — **re-opening the exact leak the module exists to close**. Only an adversarial re-review caught it, by asking "did the remediation introduce a new hole?" instead of "are the tests green?".
- Mitigation: after any security-driven fix, **re-run `/security` against the fix**, not just the test suite. Revoke `security` from `workflow.json → completed` so the phase genuinely re-runs — a verdict issued BEFORE the fix is evidence about code that no longer exists. Attack the remediation specifically: feed it the inverse of its own assumption (here: what if the marker order is reversed?).
- Corollary for `power`-track batches: `security` runs per ticket, so a fix to one ticket's finding must re-open that ticket's review, not just append to the report.

---
