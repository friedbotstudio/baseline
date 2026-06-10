# Pattern Research — harden the epic `approved: true` flip

**Library API note:** This task is entirely internal hook/governance tooling (Node `.mjs` hooks, the shared `lib/common.mjs` helpers, the epic state JSON, SOP prose). No third-party library is involved, so the **context7 MCP is not applicable** — there is no external API to verify. Per the no-recall rule, this is stated explicitly rather than skipped silently. All references below are to in-repo `path:line` confirmed in scout + this phase's verification greps.

## The fork

The epic `approved: true` flip (`harness/SKILL.md:134`) is a consent-bearing state transition enforced only by Claude's discipline. Scout established the central constraint: the approve-spec consent *marker* (`.spec_approval_grant`) is single-use and deleted at `common.mjs:255` the instant the spec-approval token write is allowed — **one step before** the harness flips `approved: true`. So the epic flip cannot validate against the marker; it is already spent.

This phase's verification adds the load-bearing fact: the spec-approval **token** (`.claude/state/spec_approvals/<slug>.approval`) is **persistent** — no hook or skill deletes it (`/archive` relocates it, but the `epic` track omits archive). The token is itself forge-proof: it can only be written through `spec_approval_guard` (`spec_approval_guard.mjs:44`), which requires a fresh marker Claude cannot produce. The token's existence is therefore durable, forge-proof proof that gate-A happened for that slug. This reframes the option space around whether to introduce *new* consent or *reuse* the consent already proven by the token.

---

## Candidate A: distinct consent class (`/approve-epic` + new marker + new guard)

- **Summary**: Add a `/approve-epic <slug>` command handled by `consent_gate_grant`, a `CONSENT_MARKER_EPIC_APPROVE` constant pair, and a new `epic_approval_guard.mjs` that validates the marker on the epic `approved: true` write — a faithful third copy of the `spec_approval_guard` / `swarm_approval_guard` shape.
- **API references (current)**: none external. Mirrors `swarm_approval_guard.mjs:37-43` + `consent_gate_grant.mjs:54-67` + `common.mjs:29-36,196-256`.
- **Fits**: Yes structurally — it is the established consent pattern. But it fits *poorly* against intent: the epic spec was already approved at gate A; a second `/approve-epic` makes the human approve the same epic twice.
- **Tests it enables**: forged-write-blocked, fresh-marker-allowed, marker-self-write-blocked, stale-marker-blocked, slug-mismatch-blocked — directly portable from the existing guard test shape.
- **Tradeoffs**:
  - Forgeability: **strong** (marker written outside Claude's boundary).
  - New human steps: **+1 per epic** — the redundant second approval. This is the dominant cost.
  - Governance churn: **high** — hook count 22→23 across `CLAUDE.md` (×4 prose sites + Article VIII row), `seed.md §4.1` (×2), `README.md` (×3), both byte-equal mirrors, `audit.mjs:91` `EXPECTED_HOOKS`, and the manifest rebuild.
  - `track_guard` read side: unchanged.

## Candidate B: write-time gate against the persistent approval token (recommended)

- **Summary**: A guard allows the epic `approved: true` write only when `.claude/state/spec_approvals/<epicSlug>.approval` exists, where `<epicSlug>` is derived from the epic-state path being written (`.claude/state/epic/<epicSlug>.json`). No new command, no new marker, no new human step — it reuses the gate-A consent already crystallized in the persistent, forge-proof token.
- **API references (current)**: none external. Reuses `canonicalRel`/`canonicalSlug` (`common.mjs:136-156`), `computeProposedContent` (`:262-286`) to detect the `approved: true` transition, `emitBlock`/`emitAllow`. Token path + persistence confirmed (`spec_approval_guard.mjs:44`; no deletion found).
- **Fits**: Yes — and it fits *intent*: it honors the intake non-goal ("gate-A flow stays unchanged") literally, since it adds nothing to gate A and simply consumes its durable output. The flip happens immediately post-gate-A while the token is present, so it is robust against the later archival relocation of the token.
- **Tests it enables**: approved:true-without-token → block; approved:true-with-matching-token → allow; non-`approved` epic-state write (children[] append, status flip) with no token → allow (only the transition is gated); slug-mismatch token → block; forged token write attempt → already blocked by the existing `spec_approval_guard`, assert the chain.
- **Tradeoffs**:
  - Forgeability: **strong, derived** — Claude cannot write the token (gate-A guard blocks it), so it cannot satisfy this gate either. Security rests on the same root as gate A; no new trust assumption.
  - New human steps: **zero**.
  - Governance churn: **two sub-options** — (B1) a dedicated `epic_approval_guard.mjs` → clean one-hook-one-Article-VIII-row mapping but count 22→23; (B2) fold the check into `track_guard.mjs` (which already owns epic-state semantics and fires on the same event) → **no count change**, but couples track-ordering and consent in one hook, muddying the Article VIII one-hook-one-concern mapping. This is the only real sub-decision and it is a `/spec` call.
  - `track_guard` read side: unchanged — write-side enforcement guarantees `approved: true` only exists when a real token backed it, so the existing `es.approved === true` read (`track_guard.mjs:51`) stays sound. Read-side re-derivation is optional defense-in-depth, not required.

## Candidate C: eliminate the trusted flag — derive approval from the token at read time

- **Summary**: Stop trusting the stored boolean. Change `track_guard.epicInheritanceSatisfied` (`:44-61`) to require `.claude/state/spec_approvals/<epic>.approval` on disk **instead of** `es.approved === true`. The harness stops writing `approved: true` as authoritative (keep it, if at all, only as a non-load-bearing display mirror). The forgeable boolean — and thus the attack surface — is deleted rather than guarded.
- **API references (current)**: none external. Touches `track_guard.mjs:44-61`, `harness/SKILL.md:134`, `triage/SKILL.md:4,80`, and the epic-state schema semantics.
- **Fits**: Conceptually the cleanest and most in keeping with the repo's "remove trust, don't add ceremony" aesthetic (cf. the single-use marker, the v1 proof-obligation thesis). But it changes the contract of a feature that **just shipped** (epic tracks, commit `66fac2a`).
- **Tests it enables**: child-blocked-when-no-token; child-allowed-when-token-present; forged `approved: true` is simply ignored (no longer consulted).
- **Tradeoffs**:
  - Forgeability: **strongest** — there is no flag to forge; authorization is always the forge-proof token.
  - New human steps: **zero**; new hooks: **zero**; new markers: **zero**.
  - Governance churn: **low on hooks** (no new hook) but **higher on contract** — changes the epic-state meaning of `approved`, touches triage + harness SOP prose, and needs a migration story for epic states already on disk (the intake left migration as an open question).
  - **Coupling risk**: read-time derivation is fragile w.r.t. future archival — once an `/epic-close` (backlog `-02a3`) relocates the token, late child gating would break. B does not have this fragility because it checks at flip time, not read time. This is the decisive mark against C *right now*.
  - `track_guard` read side: **mandatory change** (this is the whole mechanism).

---

## Recommendation

**Candidate B**, with the B1/B2 hook-placement sub-decision deferred to `/spec`.

Rationale: B closes the trust gap with **zero new human steps** and **no new trust root** — it consumes the durable, forge-proof artifact gate A already produces, which is the most faithful reading of the "gate-A stays unchanged" non-goal. It is strictly better than A, which adds a redundant second approval and the full hook-count churn for no security gain over B. It is preferable to C *at this moment* because C changes the contract of a feature that shipped days ago and is fragile against the planned `/epic-close` archival, whereas B checks at flip time (token guaranteed present) and leaves the shipped epic schema and SOP intact.

**What would flip the decision:**
- → **C** if the maintainer wants to eliminate the trusted-boolean class outright as a deliberate step toward the v1 "remove trust, bind to oracles" thesis, and is willing to absorb the epic-schema/SOP contract change + a migration note. (C and the `-02a3` epic-close work would then need to be sequenced together so archival preserves derivability.)
- → **A** only if a future requirement genuinely needs epic approval to be a *separate human decision* from spec approval (e.g., spec approved by one role, epic budget/scope approved by another). No such requirement exists today; absent it, A is pure ceremony.

For B itself, lean **B1 (dedicated `epic_approval_guard`)** for the clean Article VIII mapping unless the maintainer prefers to avoid the 22→23 count churn, in which case **B2 (fold into `track_guard`)** is the lower-churn path.

## Open questions

- **B1 vs B2** (dedicated new guard vs. fold into `track_guard`): clean Article-VIII mapping + count churn, vs. no count churn + coupled concerns. A `/spec` decision.
- **track_guard read side**: leave as-is (write-side enforcement is sufficient under B) or add read-time token re-check as defense-in-depth? Recommend leave-as-is to avoid the archival-coupling fragility that sinks C.
- **Existing on-disk epic states**: any epic currently carrying `approved: true` predates the guard. Migrate/re-validate, or govern writes from here forward only (intake's stated lean)? Under B this is moot for reads (the flag is still trusted on read) but matters if C is ever adopted.
- **Token-presence vs. token-freshness**: the token has no TTL (approval is durable). Confirm the guard checks *existence + slug match* only, not age — matching the semantics that "an approved spec stays approved."
- **Scope of other trusted flips**: intake flagged `harness_state` / `workflow.json → completed` as possible same-pass hardening. Recommend explicitly out-of-scope here (single-purpose change); note for a future pass.
