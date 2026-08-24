---
key: a-rule-shared-by-a-guard-and-its-preflight-lives-in-one-module
category: conventions
scope: [spec, tdd, simplify, integrate]
governs: .claude/hooks/lib/corpus-reference.mjs,.claude/hooks/lib/plantuml-blocks.mjs,.claude/hooks/lib/design-calls.mjs,.claude/hooks/spec_diagram_presence_guard.mjs,.claude/skills/spec-lint/lint.mjs
verified-at: 0336688
last-touched: 2026-08-25
---

- **The convention.** When a write-boundary guard and its `/spec-lint` preflight judge the same property, the rule lives in **one** module that both import. Never a copy in each.
- **The three live instances.** `hooks/lib/design-calls.mjs` exports `parseDesignCalls` / `findRowDefects` for `spec_design_calls_guard` + `/spec-lint`. `hooks/lib/corpus-reference.mjs` exports `STRUCTURAL_KINDS` + `elementReferences` + `malformedReferences` for `spec_diagram_presence_guard` + `/spec-lint`. `hooks/lib/plantuml-blocks.mjs` exports `plantumlBlocks` / `blockSatisfies` / `missingKinds` for the same pair.
- **Why, from a real failure.** The `@ref element:<id>` carve-out that lets a spec satisfy the C4 kinds by referencing a corpus element was implemented **only in the guard**. `lint.mjs` imported `resolveProfile` from the same module and still reported `diagram_presence FAIL` on a spec the guard allowed — measured on `docs/specs/corpus-recall-reachability.md`: guard exit 0, lint exit 1, same bytes. It drifted on the affordance's first real use, and `lint.mjs` carries a comment claiming the two "never disagree".
- **Split the rule at the IO boundary, not the logic.** The parse is stdlib-only and content-only — one `REF_WELL_FORMED` constant that `hasMalformedReference` tests and `elementReferences` reads the capture from. Each caller resolves ids against `docs/system/elements/` itself, which is also where the two legitimately differ: the guard blocks an unresolvable id, the preflight reports it.
- **One shared module per rule, not one shared module per pair.** The reference parse lived in `write-set-profile.mjs` until 2026-08-25 because that module already served both callers. It is the write-set/diagram-profile resolver; the reference grammar was a second unrelated rule sharing the file, and housing a rule in its own module is what this convention asks for — not merely importing it from somewhere. Reading the convention as "any shared module will do" is how a 91-line module acquires two subjects. Split to [[.claude/hooks/lib/corpus-reference.mjs]] and [[.claude/hooks/lib/plantuml-blocks.mjs]]; `write-set-profile.mjs` now imports `malformedReferences` rather than defining it.
- **The smell.** A preflight advertised as running "the same checks" as a guard, where the two implement the check separately. That sentence is a claim the code has to keep, and only a shared module keeps it.
