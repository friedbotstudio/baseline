---
key: a-rule-shared-by-a-guard-and-its-preflight-lives-in-one-module
category: conventions
scope: [spec, tdd, simplify, integrate]
governs: .claude/hooks/lib/write-set-profile.mjs,.claude/hooks/lib/design-calls.mjs,.claude/hooks/spec_diagram_presence_guard.mjs,.claude/skills/spec-lint/lint.mjs
verified-at: d4a1a47
last-touched: 2026-08-06
---

- **The convention.** When a write-boundary guard and its `/spec-lint` preflight judge the same property, the rule lives in **one** module that both import. Never a copy in each.
- **The two live instances.** `hooks/lib/design-calls.mjs` exports `parseDesignCalls` / `findRowDefects` for `spec_design_calls_guard` + `/spec-lint`. `hooks/lib/write-set-profile.mjs` exports `STRUCTURAL_KINDS` + `elementReferences` for `spec_diagram_presence_guard` + `/spec-lint`.
- **Why, from a real failure.** The `@ref element:<id>` carve-out that lets a spec satisfy the C4 kinds by referencing a corpus element was implemented **only in the guard**. `lint.mjs` imported `resolveProfile` from the same module and still reported `diagram_presence FAIL` on a spec the guard allowed — measured on `docs/specs/corpus-recall-reachability.md`: guard exit 0, lint exit 1, same bytes. It drifted on the affordance's first real use, and `lint.mjs` carries a comment claiming the two "never disagree".
- **Split the rule at the IO boundary, not the logic.** `write-set-profile.mjs` is stdlib-only and content-only by design (its own header says so), so it owns the parse — one `REF_WELL_FORMED` constant that `hasMalformedReference` tests and `elementReferences` reads the capture from. Each caller resolves ids against `docs/system/elements/` itself, which is also where the two legitimately differ: the guard blocks an unresolvable id, the preflight reports it.
- **The smell.** A preflight advertised as running "the same checks" as a guard, where the two implement the check separately. That sentence is a claim the code has to keep, and only a shared module keeps it.
