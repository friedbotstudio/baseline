---
key: spec-contracts-rows-are-never-checked-against-reality
category: backlog
scope: []
status: picked-up
source: assistant-deferral
raised-on: 2026-08-13
raised-in-context: diagram-shard-rewrite-loses-fields
verified-at: be0a351
last-touched: 2026-08-13
governs: .claude/skills/spec-lint/lint.mjs, .claude/skills/spec/template.md
superseded-at: 2026-08-13
---

> The spec's `## Contracts` table pinned `node .claude/skills/workspace/restore-degraded-shards.mjs [--dry-run]`. That CLI did not exist, and the address contradicted the house front-door convention. `spec-lint` returned PASS on all five checks, three times, across three approvals of that spec.

- **The gap.** `spec-lint` checks plantuml syntax, diagram presence, AC traceability, design calls and System delta rows. Nothing reads the `## Contracts` table. A row can name a function that was never written, a CLI that does not exist, or an address that contradicts the repo's own conventions, and every machine gate stays green.
- **What caught it instead.** `/integrate`, by reading the table and comparing it to disk — human-in-main-context judgment, at the last phase before commit. `drift_check` could not: it scores AC ids, and no AC named the CLI.
- **Why it matters beyond one row.** Article VI.4's two-sided rule says YAGNI never authorizes deferring spec-committed scope, and no AC row carried a `deferred:` tag. So the spec committed to a capability, the workflow did not build it, and nothing structural noticed. The same hole passes a spec whose Contracts row describes a signature the implementation does not have.
- **Shape of the fix.** A `contracts` check in `spec-lint`: for each row of Kind `Function`, assert the named symbol is exported somewhere in the `write_set`; for Kind `CLI`, assert the invocation's entry point exists. Both are cheap and both fail loudly at spec time rather than at integrate. Rows naming a symbol the work will CREATE need the same not-yet-exists tolerance that [[spec-lint-add-row-check-requires-the-file-to-exist]] describes for `add` rows, so the two want solving together.
- Instance of [[a-checker-aimed-one-axis-off-passes-loudly]] — five loud spec checks, none aimed at the table that carries the promises.
