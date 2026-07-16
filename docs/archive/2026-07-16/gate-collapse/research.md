# Pattern Research — gate-collapse (D3 / CO-E)

No third-party libraries are involved — this is internal governance/harness machinery only, so the context7 current-docs mandate (VI.5) does not apply here (nothing external to verify). All references below are to in-repo modules mapped in `docs/scout/gate-collapse.md`.

The engineer's brainstorm fixed two decisions; candidates below vary the **mechanism**, not those decisions:
- **D1 (fixed):** approve-direction fires early at **intake** and eliminates the human `/approve-spec` gate.
- **D2 (fixed):** with `governance.class.enabled` OFF, the flow degrades to exactly **two** gates (never single-auth collapse).

## Prior art (retrieved)

- `docs/archive/2026-07-15/input-half-governance-class/spec.md` (A4) — the provenance anchor. Design invariant reused verbatim: **"A4 adds the provenance anchor on top of the consent marker, never in place of it… the human marker remains the sole consent source, written outside Claude's tool boundary by `consent_gate_grant`."** CO-E extends this: the human marker *moves* to intake, but the provenance-on-top-of-marker shape is unchanged. Token line 6 = `ledger_ref`; evidence-ledger gains a `kind:"approval-provenance"` entry. **Delta:** CO-E must decide whether the direction token carries the 6-line (provenance) or 5-line (plain) shape, and it is generated at intake, not spec.
- `.claude/memory/decisions.md:168` (epic-approval-read-side-token-derivation-2026-06-21) — **the sharpest constraint.** `track_guard.epicInheritanceSatisfied` and `epic_approval_guard` both derive authority from `.claude/state/spec_approvals/<slug>.approval` — "the forge-proof gate-A token is the unforgeable root; the `approved` boolean is inert at the read boundary." **Reused conclusion:** the collapse must keep producing a token at that path (or re-anchor both epic consumers in lockstep). Retiring the token path silently would reopen the exact forgeable-boolean hole `-eda6` closed.
- `.claude/memory/decisions.md:19` (branch-aware-git-policy) — precedent for **adding a consent command symmetric with the existing ones** (`/grant-push` was added alongside `/grant-commit`, sharing `consent_gate_grant` + `validateConsentMarker`). Confirms the "new arm in `consent_gate_grant` + new marker constant in `common.mjs` + new guard" pattern is the established way to add a gate.
- Delta newly derived below: where the direction gate's node sits in the DAG, what substitutes for human spec review, and the intake-content-hash question.

## The machine substitutes for human spec review (cross-cutting, applies to all candidates)

Eliminating the human `/approve-spec` gate is only safe if the scope-conformance work the human did there is mechanically covered. It is, by an existing oracle stack anchored on the intake ACs the human **did** approve at direction time:
- `spec-traceability-review` — every spec AC must trace to a resolvable upstream **intake** AC, and no intake AC is silently dropped. **This is the direct substitute for human scope review**: it binds the spec to the approved direction.
- `spec_design_calls_guard` + the C4 design-judge — reference-target presence + quality (CO-B / intake AC4).
- `checker-fanout` (spec-diagram, spec-traceability) + `spec-shippability-review` — internal consistency + no dev-tree leaks.
- harness `drift-check-tick` — implementation ↔ spec.

Research finding: no NEW oracle is required — the substitute already exists. The spec must name this stack as the load-bearing replacement and confirm `spec-traceability-review` is wired to run (it currently runs in the checker fan-out / spec-review boundary).

## Candidate A: New `/approve-direction` command + marker + guard; token still lands at `spec_approvals/<slug>.approval`

- **Summary**: Add a fifth arm to `consent_gate_grant` for `/approve-direction <slug>`, a new `CONSENT_MARKER_DIRECTION` constant in `common.mjs`, and a new `direction_approval_guard` that allows the approval-token write only on a fresh marker. The token is generated at **intake** time, anchored to the CO-A evidence-ledger entry (reuse `deriveApprovalToken` / `appendApprovalProvenance`), and **written to the existing `.claude/state/spec_approvals/<slug>.approval` path** so the epic guard's root of trust is untouched. The `approve-spec` DAG node is removed; `spec_approval_guard`'s token-allow arm is retired (its self-approval-block arm on `docs/specs/*.md` may be kept as a belt-and-suspenders no-op or folded into the new guard). Content hash covers `docs/intake/<slug>.md`.
- **Fits**: Yes — matches the `/grant-push` precedent (new arm + marker + guard) and preserves the epic anchor path (scout landmine #1, decisions.md:168). Clean semantics: "direction approval" is its own named thing, not overloaded "spec approval."
- **Tests it enables**: forge-proof regression (marker self-write blocked, self-approval blocked, TTL/slug freshness), token-anchored-to-ledger, intake-content-hash re-yield on post-approval intake edit, DAG materializes exactly two needs_user gates, epic inheritance still resolves on the token.
- **Tradeoffs**: Largest new surface — one new command file, one marker constant, one new guard, plus retiring `spec_approval_guard`'s token arm. Keeping the token at the `spec_approvals/` path is slightly odd naming for a directory now holding direction tokens (mitigate with a comment, or a follow-up rename that the epic guard tracks). More four-way-mirror + annex edits.

## Candidate B: Retarget the existing `approve-spec` machinery to fire at intake (rename to `/approve-direction`, move the node)

- **Summary**: Minimal new code. Keep `spec_approval_guard`, the `consent_gate_grant` arm, the `.spec_approval_grant` marker, and the `spec_approvals/<slug>.approval` token — but (1) move the gate **node** earlier in the `intake-full` DAG so it depends on `intake` (not `spec-shippability-review`), (2) alias the command to `/approve-direction`, (3) switch the content hash from the spec doc to the intake doc, (4) anchor the token to intake ACs + the CO-A ledger entry.
- **Fits**: Partial — reuses every existing guard/marker/token (epic anchor untouched, scout landmine #1 safe by construction). But it drags "spec approval" naming and the `spec_approval_guard`'s spec-specific logic (`Status: Approved` scan on `docs/specs/*.md`, shippability/checker-fanout `BLOCKED` cross-checks at `:53-91`) onto an intake-time gate where those checks don't yet have a spec to read.
- **Tests it enables**: Same as A minus the new-guard tests; plus regression that the moved node still blocks `implementation` and that the content-hash swap (spec→intake) re-yields correctly.
- **Tradeoffs**: Least code, but the semantic overload is a maintainability trap — a future reader sees `spec_approval_guard` firing before any spec exists. The `:53-91` BLOCKED cross-checks (shippability/checker-fanout verdicts) reference spec-time artifacts that don't exist at intake; they'd have to be moved to a *later* mechanical checkpoint (the now-machine-only spec gate), splitting the guard's concern. Higher risk of a subtle correctness bug on a security-critical path.

## Candidate C: Human direction gate at intake + machine-satisfied checkpoint at spec (token auto-written on all-green)

- **Summary**: Human confirms direction at intake (new lightweight gate, as in A/B). At spec time, instead of a human gate, a mechanical checkpoint auto-writes the `spec_approvals/<slug>.approval` token when the full oracle stack (traceability + shippability + checker-fanout + design-calls) is green — keeping the epic anchor produced at spec time as today.
- **Fits**: No — **fails the forge-proof invariant.** A token auto-written by machine logic that Claude's own phase skills drive is, in effect, Claude-satisfiable consent (intake non-goal #1, AC2/AC4). The whole point of the marker/guard split is that the *consent* artifact is writable only outside Claude's tool boundary. C reintroduces a Claude-reachable path to the token.
- **Tests it enables**: Would need a test proving the auto-write is not a consent bypass — which is the tell that it *is* one.
- **Tradeoffs**: Preserves the epic anchor at its current position (no epic-guard change), but at the cost of the core security property. Rejected on principle; documented so the spec can cite why the "keep the token at spec time" convenience was not taken.

## Recommendation

**Candidate A.** It is the only option that keeps clean semantics AND preserves the epic guard's unforgeable root (the `spec_approvals/<slug>.approval` path) AND holds the forge-proof invariant (new marker written only by `consent_gate_grant`, guard blocks self-writes). The extra surface is the honest cost of a Class-A consent-flow change; the four-way mirror has to be touched regardless.

**What would flip it:**
- To **B** — if the team prioritizes absolute-minimum new surface and accepts the "spec_approval_guard fires pre-spec" semantic overload plus splitting its `BLOCKED` cross-checks to a later checkpoint. Viable but a maintainability tax.
- Away from both — if, in spec, we decide the epic guard should be **re-anchored** to a new `direction_approvals/<slug>.approval` path (cleaner naming) rather than reusing `spec_approvals/`. That trades one lockstep edit (epic guard + track_guard `epicInheritanceSatisfied` + the annex) for better naming. Recommend deferring that rename to keep this change's blast radius bounded, but flag it as the natural follow-up.

## Open questions (for the human reviewer at the direction gate / spec author)

1. **Token path & epic anchor.** Reuse `spec_approvals/<slug>.approval` (zero epic-guard change, odd naming) or introduce `direction_approvals/<slug>.approval` and re-anchor `epic_approval_guard` + `track_guard.epicInheritanceSatisfied` in lockstep? (Recommend reuse now, rename later.)
2. **Token shape.** Does the direction token carry the 6-line provenance shape (`ledger_ref`) unconditionally, or only when `governance.approval_provenance.enabled` is on (5-line otherwise)? Ties to whether CO-E hard-requires the CO-A ledger entry or degrades when provenance is off.
3. **Intake content hash.** Confirm the direction gate hashes `docs/intake/<slug>.md` so a post-approval intake edit re-yields (mirroring the spec-content-hash discipline). New: `intake-content-hash.mjs` or generalize `spec-content-hash.mjs`.
4. **Swarm gate (B) placement.** `/approve-swarm` is separate (swarm path only). Confirm it stays as-is and the "collapse" is scoped to the solo flow's approve-spec→(gone) + grant-commit, i.e. reconcile the brief's "three" against seed §6's "four consent gates."
5. **Fate of `spec_approval_guard`.** Retire its token-allow arm; keep or drop its `Status: Approved` self-approval scan and the `:53-91` BLOCKED cross-checks (relocate the latter to the machine spec checkpoint).
6. **Class-off degrade wiring.** Confirm the 3→2 base collapse is the off-flag default, and only the 2→1 further collapse reads `governance.class.enabled` + low-Class.
