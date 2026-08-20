---
key: A spec must name the existing function it considered before committing to a new one
category: backlog
scope: []
status: open
source: user-instruction
raised-on: 2026-08-20
raised-in-context: cycle-time-fixes
verified-at: 2909d59
last-touched: 2026-08-20
governs: .claude/skills/spec/SKILL.md, .claude/skills/scout/SKILL.md
---

verbatim:
> We also need to encourage very high code reusability to ensure we don't reinvent
> the wheel and take 50 minutes writing a simple list function.

- Reuse is the third of three cycle-time problems raised in the cycle-time-fixes
  session. The other two were addressed there: phase re-entries are now stamped
  (`attempts` → `<phase>:attempt-<k>` rows), and `spec-entry` gained a scout node.
  This one was deliberately left open — nothing in that landing touches it.
- The proposed rule: before a spec commits to a NEW function, its design section
  names the existing function it considered and says why that one does not fit.
  `scout` already produces the candidate list, and `.claude/memory/landmarks/`
  carries 128 entries usable as the inventory to check against.
- Why a spec-level rule rather than a code-review rule: at code-review time the
  duplicate is already written, so the cost the user is objecting to has already
  been paid. The check has to sit where the commitment is made.
- Not yet designed. Open questions: whether the citation is a required spec
  section (enforceable by `spec-lint`) or an advisory checker in the gate-A
  fan-out, and how a spec declares "no existing candidate" without the row
  becoming a rubber stamp.
