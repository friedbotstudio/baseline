---
key: unmeasured-collapses-saw-no-row-and-returned-nothing-into-one-message-5b07
category: backlog
status: open
scope: [tdd, chore]
governs: .claude/skills/conformance/engine.mjs, .claude/skills/conformance/cli.mjs, .claude/skills/audit-baseline/checks/conformance.mjs
source: assistant-deferral
raised-on: 2026-09-02
raised-in-context: gate-fidelity
verified-at: 02f3c68
last-touched: 2026-09-02
---

> The engineer reading it goes looking at the reader's return value, when the actual bug is its `artifact` key or a fixture file that never loaded.

- `runConformance` puts a reader in `unmeasured[]` for two different reasons: it matched **no fixture row at all**, or it ran and came back **degenerate on every row**. Both render as one sentence — `returned nothing on every row` in the CLI, `measured nothing on every row` in the audit row.
- For the first cause the sentence is false. Measured: a registration with `artifact: 'no-such-artifact'` matched zero rows and still printed `returned nothing on every row`. It never ran on a row, so it returned nothing on none of them.
- Cost: the reader debugs the wrong thing. The real fault in that case is the registration's `artifact` key or a fixture file that failed to load, neither of which the message points at.
- **Why it was not fixed in the `gate-fidelity` cycle.** The approved spec's Contracts table pins `unmeasured : string[]`. Carrying a reason needs either a shape change to that field or an additive sibling field, and both are spec changes after gate A. Amending an approved contract without the human is exactly what Art. V forbids, so it was surfaced at `/cli-copy-review` and filed instead.
- The engine already distinguishes the two internally — `sawAnyRow` and `sawNonDegenerate` are separate sets — so the fix is render-side once the contract allows a reason to travel.
- Suggested shape: `UNMEASURED  ghost:reader saw no fixture row (artifact "no-such-artifact")` against `UNMEASURED  slice-grammar:acs returned nothing on all 15 rows`.
- The sibling finding from the same review (an `UNMEASURED` floor message that named no path) WAS fixed in-cycle, at `engine.mjs`, since it was a pure string. See [[claude-skills-conformance-engine-mjs]].
