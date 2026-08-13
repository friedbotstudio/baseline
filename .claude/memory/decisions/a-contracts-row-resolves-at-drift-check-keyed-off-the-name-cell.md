---
key: a-contracts-row-resolves-at-drift-check-keyed-off-the-name-cell
category: decisions
scope: [spec, implement, integrate]
governs: .claude/skills/tdd/drift_check.mjs, .claude/skills/spec/template.md, .claude/skills/spec-lint/lint.mjs
load_bearing: true
verified-at: be0a351
last-touched: 2026-08-13
---

- Decision: a spec's `## Contracts` row is a promise enforced at **drift-check**, and resolution keys off the **Name** cell. The `Kind` column is never read.

**Why not spec-lint, which is where the backlog entry proposed it.** A Contracts table describes what the work WILL build. At spec time none of it exists, so an existence assertion there fails every spec at authoring. The obligation is structurally an AC's: promised at Phase 4, owed by the end of Phase 6. This **supersedes** backlog `spec-contracts-rows-are-never-checked-against-reality`, whose proposed shape was wrong; recorded here because that entry closes at this workflow's commit and the correction must outlive it.

**Why not the Kind column.** Measured across 636 rows in 102 of 104 specs: ~150 distinct free-text values. `CLI` 126, `Function` 72, `Module` 51, `Fn` 31, `fn` 30, `File` 29, then a long tail including `Node API`, `npm script`, `GA4 event (auto)`, `Maker (workflow agent)` and a backticked template path used *as* a Kind. `Function`/`Fn`/`fn`/`fn (export)`/`Hook fn`/`Helper` are one concept spelled six ways. There is no enum to switch on, and constraining it would be a migration across 102 archived specs.

**Where the token comes from.** 607 of 636 Name cells (95%) carry a backticked span, and that span is the machine-readable part; the rest of the cell is prose. Strip `<…>` `[…]` `{…}` `(…)` before tokenizing — a placeholder never appears in a diff, and a call's argument list is not part of its name.

**Two mechanisms, because one was measured insufficient.** The diff scan catches a promised name that appears nowhere. It does NOT catch a name present in another capacity: the motivating row named a module path that a test file held as a string constant, so it resolved while the promised CLI did not exist. An invocation-shaped row therefore also gets a static disk probe for runnability. **Verify this claim before trusting a future simplification that drops the probe** — the diff scan alone would not have caught the defect that created this decision.

- **Under-report, deliberately.** `drift_check` gates every spec-track TDD phase. A missed promise costs one review cycle; a false positive halts a workflow that did nothing wrong. Uncheckable rows read `skipped` and never reach the exit code.
- **The check is one-directional** — see [[nothing-catches-a-surface-that-shipped-without-being-promised]].
- Related: [[an-epic-spec-cannot-be-scored-against-its-own-landing-commit]], [[a-lexical-containment-check-is-defeated-by-a-symlink]] (the probe's own path guard).
