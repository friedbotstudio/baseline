---
key: widen-the-witness-predicate-never-the-registry
category: decisions
scope: [spec, tdd, integrate]
governs: .claude/skills/workspace/witness.mjs,.claude/skills/codebugger/**
source: gate-A approved 2026-08-15, spec `docs/specs/codebugger-explanation-trace.md` §Decisions D3.
verified-at: 8fb72a5
last-touched: 2026-08-15
---

- **Decision.** A new witness kind joins `.claude/skills/workspace/witness.mjs` by widening **`isCitable`** (the pure predicate) and **not** `bindingFor`/`readWitnesses` (the config-backed registry). The `codebugger` explanation trace adds `runtime-read` as citable; `instrumentation` and `none` stay non-citable.
- **Why the seam is there and not elsewhere.** `readWitnesses` reads `project.json → memory.architecture_map.witnesses`. Extending the *registry* would therefore make a debugging session's root-cause citability depend on whether the architecture map is enabled — a corpus feature deciding whether a diagnosis counts as evidence. The predicate carries no config read, so widening it costs nothing.
- **Why the widening is safe, by construction not by inspection.** Both callers — `workspace/graph.mjs:40` and `workspace/reconcile.mjs:142` — pass a value produced by `bindingFor`, which can only return a registry value or `none`. It can never produce `runtime-read`, so no diagram's citability changes. That is a structural argument, not a survey of call sites, and it stays true as callers are added provided they keep sourcing the witness from `bindingFor`.
- **The measurement that forced this.** The original plan was to *import* `isCitable` unchanged. Executed rather than assumed: `witness.mjs` imports standalone at no cost and exports exactly `bindingFor` and `isCitable` — but `isCitable('runtime-read')` returns **false**, so importing it unchanged would have refused every observation row in every trace. The import question and the widening question looked like one question and were two.
- **What it preserves.** One definition of evidence for the whole baseline. The rejected alternative — a local constant list in `codebugger/evidence.mjs` plus a test asserting the two agree — keeps the modules independent at the cost of two places defining what counts as proof, and the day one is amended and the other is not, the repo says two different things.
- **Inherits** the taxonomy and the permitted-but-non-citable treatment from [[durable-diagram-witness-rule-replaces-kind-whitelist-2026-08-06]] and [[unwitnessed-diagrams-are-the-only-noncitable-ones-2026-08-06]]. `instrumentation` is the trace's unwitnessed tier: recorded, labeled lower-confidence, never cited.
- **Re-verification.** Read `.claude/skills/workspace/witness.mjs`. If `isCitable` has grown a config read, or if `bindingFor` can return `runtime-read`, this decision has been reverted and the config gate is back in the citability path.
