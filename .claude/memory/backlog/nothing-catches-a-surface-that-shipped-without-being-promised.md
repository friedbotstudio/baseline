---
key: nothing-catches-a-surface-that-shipped-without-being-promised
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-13
raised-in-context: contracts-rows-resolve-at-drift-check
verified-at: be0a351
last-touched: 2026-08-13
governs: .claude/skills/tdd/drift_check.mjs, .claude/skills/spec-lint/lint.mjs
---

> The Contracts check is one-directional. It finds a row with nothing behind it; it never finds an export the table forgot to name.

- **The gap.** `drift_check` scores each Contracts row against the diff, so a promise with no implementation is caught. The inverse — a public function that shipped without a row — is invisible to every machine gate.
- **Demonstrated by the workflow that built the check.** `sweepArchivedSpecs` was written, exported and tested before the spec promised it. `/implement` surfaced it, the Contracts table gained a fifth row at the correction pass, and the drift report then went clean. **Had the row never been added, that report would have looked exactly as clean** — five exports, four rows, no signal anywhere.
- **Why it matters more than it sounds.** A spec's Contracts table is the reviewed API surface. An unpinned export is a public surface nobody approved, and on a baseline-owned module it ships to every consumer.
- **Shape of a fix.** Compare the module's exported names against the write_set's Contracts rows and report exports with no row — as an ADVISORY, not a blocker, since a genuinely private helper promoted to `export` for testing is a legitimate and common case. `/simplify`'s reuse-before-create pass and human review are the only cover today.
- Counterpart to [[a-contracts-row-resolves-at-drift-check-keyed-off-the-name-cell]], which records the direction that IS covered.
