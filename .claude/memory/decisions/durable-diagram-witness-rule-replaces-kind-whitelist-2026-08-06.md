---
key: durable-diagram-witness-rule-replaces-kind-whitelist-2026-08-06
category: decisions
scope: [spec, tdd, integrate]
governs: .claude/skills/workspace/witness.mjs,.claude/skills/workspace/reconcile.mjs,.claude/skills/workspace/digest.mjs,docs/system/**
source: engineer decision, gate-A approved 2026-08-06. Spec `docs/specs/central-system-spec.md` §Decisions, first row; supersedes the architecture-map cycle's own ruling.
verified-at: d4e6216
last-touched: 2026-08-06
---

- **Decision.** Supersedes **D2** of the architecture-map spec (`docs/archive/2026-08-05/architecture-map/spec.md`). The restriction on what may live in the durable corpus changes from a *kind whitelist* — structure and validator-backed data shapes only, with sequence/activity/BPMN/timing/use-case excluded — to a **witness rule**: every durable diagram declares what falsifies it. The witness is one of `anchor-digest` (the existing structural-interface hash), a named `test`, or `none`.
- **Rationale.** The superseded ruling's own stated principle is falsifiability: "a diagram the reconcile pass can check against code can be kept honest; one it cannot is a claim nobody can falsify." The kind whitelist was a *proxy* for that property, forced by a mechanism limit — `anchor_digest` covers an exported-symbol surface, and code has no sequence surface to hash. Tests supply the missing surface. Enforcing the property directly is strictly stronger than approximating it by diagram type, and it stops the corpus from being structurally unable to model a domain that is behavioural rather than structural.
- **What it unblocks.** Baseline is a governance layer installed into other people's repositories. Under the whitelist, a consumer whose system is a business process or a state machine could not put its real shape in the central spec at all. Under the witness rule they can, with the honesty property intact — see [[unwitnessed-diagrams-are-the-only-noncitable-ones-2026-08-06]] for what an unwitnessed diagram may and may not be used for.
- **Re-verification.** Read `.claude/skills/workspace/witness.mjs`. If `bindingFor` no longer resolves a witness per kind, or if any caller reintroduces a kind-based exclusion, this decision has been reverted and the corpus is back to approximating falsifiability by taste.
