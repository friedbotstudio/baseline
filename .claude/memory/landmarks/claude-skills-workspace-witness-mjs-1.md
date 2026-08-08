---
key: .claude/skills/workspace/witness.mjs:1
category: landmarks
scope: []
governs: .claude/skills/workspace/witness.mjs, .claude/skills/workspace/reconcile.mjs, .claude/skills/workspace/shards.mjs, .claude/project.json
rests_on: zero-runtime-dependencies
verified-at: d4e6216
last-touched: 2026-08-06
---

- Path: `.claude/skills/workspace/witness.mjs`. Domain — binds a diagram kind to the thing that would prove it wrong. Added by ticket C of `central-system-spec` (2026-08-06).
- Role: `bindingFor(kind, {rootDir})` reads `project.json → memory.architecture_map.witnesses` and returns the witness type for a kind; `isCitable(witness)` answers whether a diagram carrying that witness may be cited as evidence. Shares `readProjectConfig` with `surface.mjs`.
- Three tiers, configured not hardcoded: `anchor-digest` (C4 context/container/component, class, dependency graph), `test` (sequence, activity, state machine — the shard names it via `' @witness <path>`), and `none`.
- **The `none` tier is the reason the corpus works for projects baseline is not.** A team modelling a business process gets BPMN or a timing diagram in their central spec; it is permitted and simply marked as a claim nothing falsifies. This replaced the architecture-map D2 rule, which excluded whole diagram *kinds* — the witness rule preserves falsifiability without restricting the diagram vocabulary. See [[durable-diagram-witness-rule-replaces-kind-whitelist-2026-08-06]] and [[unwitnessed-diagrams-are-the-only-noncitable-ones-2026-08-06]].
- **Fails open to `witness: none`.** A malformed, null, array-shaped or wrong-typed `witnesses` config yields `none` rather than throwing — the safe direction, since `none` is non-citable. Note this is the opposite policy to `surface.mjs`, which refuses; the asymmetry is intentional and each is documented at its own call site.
- **Known gap, not fixed:** `anchor-digest` is vacuous for any file with no exports, which is every hook. See [[anchor-digest-is-vacuous-for-exportless-files-3f7c]] — a diagram over the hook layer is currently marked witnessed and citable while its witness can never change.
- Companions: `.claude/skills/workspace/reconcile.mjs` (applies the binding in `withWitness`), `.claude/skills/workspace/shards.mjs` (parses `' @kind` / `' @witness` from PlantUML comments).
