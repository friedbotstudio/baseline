---
key: .claude/hooks/lib/scoped-memory.mjs
category: landmarks
scope: []
governs: .claude/hooks/lib/scoped-memory.mjs
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Foundation — surfaces the fact files scoped to a given phase, verbatim-first. The generalization of `process_lifecycle_guard`'s trigger→key→surface pattern: a phase (or trigger) resolves to the relevant fact keys, which are surfaced before the matched action so a captured lesson becomes an active constraint at the decision point (T4's core goal).
- This is the **phase** trigger, keyed on `scope:`, and it stayed a straight membership test when the path trigger was added beside it (epic decision D3). `governs:` path globs are the other vocabulary and live in `.claude/hooks/lib/governed-memory.mjs:51`; the two never merged into one field.
- Companion: `.claude/hooks/process_lifecycle_guard.mjs:50` (its caller — note the two triggers are mutually exclusive, see the `governs-globs-under-a-phase-prefix-never-surface` landmine).
