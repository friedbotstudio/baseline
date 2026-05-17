# Pattern Research — harness-auto-resume-after-consent-gate

This memo compares the three architectural options surfaced in the intake (Q1) for auto-resuming the harness after a consent slash command, grounded in scout-confirmed evidence (`docs/scout/harness-auto-resume-after-consent-gate.md`). No third-party library APIs are involved — every surface lives in this repo (`.claude/hooks/`, `.claude/commands/`, `.claude/skills/harness/`, `CLAUDE.md` Articles IV+V, `tests/`).

Decision is deferred to `/spec`. This memo lays out the option space.

---

## Candidate A: Slash-command body chains `Skill(harness)`

- **Summary**: Each of the 4 consent slash command bodies (`approve-spec.md`, `approve-swarm.md`, `grant-commit.md`, `grant-push.md`) gets a new final step after writing its token: read `workflow.json` + `harness_state`; if armed and yielded for this slug, invoke `Skill(harness)`.

- **API references (current)**: No external APIs. In-repo surfaces:
  - `.claude/commands/<gate>.md` body — adds `Skill(harness)` invocation. Mechanically valid: `disable-model-invocation: true` (scout finding, lines 5 of each command) restricts WHO can invoke the slash command, not what the command body can call inside Claude's turn.
  - Article V "Resume after a `needs_user` yield" wording (currently `"the user runs the consent command, then /harness again"`) needs rewriting.

- **Fits**: PARTIAL — `Skill(<slug>)` is callable from any slash-command body. But the scout flagged a **drift risk**: four separate insertion points must stay in lock-step. The four bodies share a uniform 4-step structure (precheck → derive → Write token → confirm) — adding step 5 (auto-resume) in all four is mechanically uniform but maintenance-fragile.

- **Tests it enables**:
  - Cannot use the existing `tests/harness_continuation.test.mjs` `spawnSync(hook)` fixture pattern (the command body runs in Claude's context, not as a standalone process).
  - Would require either (i) a system-level test that invokes Claude end-to-end against a fixture project, or (ii) extracting a shared "should auto-resume?" predicate into a unit-testable helper (e.g., `.claude/skills/harness/should-auto-resume.mjs`) that each command body calls.
  - Path (ii) is YAGNI-friendly but adds a small new helper file.

- **Tradeoffs**:
  - **+** Causally explicit: user typed slash → command body chained Skill. Easy to reason about in the harness log.
  - **+** Smallest constitutional footprint: Article V wording change is the only governance-doc edit; `harness_continuation.sh` and its tests are untouched.
  - **+** Reversal is trivial: revert the appended step in each command body.
  - **−** Four insertion points = four maintenance touch-points. Adding a hypothetical 5th gate later means a 5th edit; forgetting one is silent drift.
  - **−** No test fixture today; have to invent one (extract helper, or build system test).
  - **−** Slug-mismatch behavior: the command body knows the slug it just consented for and could pre-check against `workflow.json → slug`, but the existing WARN-log emission lives in `harness_continuation.sh`'s sanity rail. Preserving WARN semantics requires touching the new helper too — modest surface bleed.

---

## Candidate B: 4th disjunctive rung in `harness_continuation.sh`

- **Summary**: Today's Stop-hook gate is `rung1 AND rung2 AND rung3` (per `harness_continuation.sh:9-14`). Add a fourth disjunctive arm: `(rung1 AND rung2 AND rung3) OR (rung1 AND rung4)`, where rung 4 is `workflow.json present` AND `harness_state.state == "yielded"` AND `mtime(any consent/approval token) > mtime(harness_state)`.

- **API references (current)**: No external APIs. In-repo surfaces:
  - `.claude/hooks/harness_continuation.sh:53-119` (the Python heredoc body) — adds the disjunctive arm.
  - `tests/harness_continuation.test.mjs` — extends the existing 8-test suite with rung-4 fixtures.
  - Article V wording — adjusted similarly to Option A (the "run `/harness` again" line is no longer accurate).

- **Fits**: YES — anchored directly to scout evidence:
  - The hook already parses `harness_state` + `workflow.json` in Python (scout: lines 78-110); reading consent-token mtimes is the same primitive.
  - The test fixture pattern (scout: `tests/harness_continuation.test.mjs` 8-case suite) handles new rungs deterministically — write fixture files with crafted mtimes, invoke hook, assert decision.
  - The bounded-once-per-turn `stop_hook_active` semantic (scout: test #8 confirms) handles the "fire once, block, harness re-invokes" loop without modification.

- **Tests it enables**:
  - "rung 4 fires when state=yielded + consent token newer than harness_state" → assert decision=block
  - "rung 4 silent when no consent token exists" → assert silent
  - "rung 4 silent when consent token mtime ≤ harness_state mtime (stale)" → assert silent
  - "rung 4 + slug mismatch logs WARN" (sanity rail preserved) → assert WARN line
  - "rung 4 silent when `stop_hook_active: true`" (re-fire bound) → assert silent
  - "rung 4 silent when workflow.json absent" → assert silent
  - All deterministic, all using the existing `spawnSync` fixture.

- **Tradeoffs**:
  - **+** Centralized: ONE file changes (plus its tests + one Article wording). Uniform across all 4 gates by construction.
  - **+** Testable with the existing pattern; no new fixture infrastructure.
  - **+** Reversal cost is small: revert the hook's Python body to the 3-rung gate, revert the test additions. One conceptual unit.
  - **+** Slug-mismatch rail (`harness_continuation.sh:90-110`) preserved unchanged — rung 4 doesn't interact with the rail's logic.
  - **+** Robust under multi-turn delay: if the user asks a clarifying question between yield and consent, `mtime(consent) > mtime(harness_state)` still holds when consent arrives. Auto-resume fires correctly even with non-adjacent turns.
  - **−** Increases the hook's complexity (a 4-rung disjunctive gate is more cognitive load than a 3-rung conjunctive one).
  - **−** The hook is bash-with-python-heredoc. The migration backlog item `migrate-bash-python-heredocs-to-javascript-d454` (open) covers porting this file. Adding to this hook grows the migration debt by a few lines.
  - **−** mtime comparison is cross-platform-OK (macOS + Linux behave identically for stat-mtime) but a subtle dependency on FS semantics. Test fixtures must explicitly set mtimes (`fs.utimes`) to be deterministic.

---

## Candidate C: `consent_gate_grant.mjs` arms a `.harness_resume_pending` marker

- **Summary**: When `consent_gate_grant.mjs` writes a gate marker, it additionally writes a new marker `.claude/state/.harness_resume_pending` (carrying the slug). A lifecycle hook reads this marker and emits a block decision.

- **API references (current)**: No external APIs. In-repo surfaces:
  - `.claude/hooks/consent_gate_grant.mjs` — add a writeMarkerAtomic call after each gate arm.
  - The reading lifecycle hook is necessarily `harness_continuation.sh` (Stop event) — UserPromptSubmit has already fired by the time the slash command body executes; there is no other lifecycle event between consent-token write and turn end. So this option **collapses into Option B with an extra file**.
  - `.claude/hooks/lib/common.mjs` — add `CONSENT_MARKER_RESUME` constant.
  - New cleanup responsibility: who deletes `.harness_resume_pending` after auto-resume fires? Likely the `harness` skill on its next invocation. This is a new cross-skill cleanup contract.

- **Fits**: NO — option C is dominated by Option B. Same Stop-hook change is required (the only lifecycle hook that fires between consent and harness invocation is Stop), but C ALSO requires editing `consent_gate_grant.mjs` plus inventing a new marker lifecycle. Strictly more surface area, no functional gain.

- **Tests it enables**: Same as B, plus a new test for `consent_gate_grant.mjs` arming the marker. The new test is pure overhead — the resume decision still flows through the Stop hook either way.

- **Tradeoffs**:
  - **+** Conceptual purity: the signal "consent just granted" lives in its own marker file rather than being inferred from mtime arithmetic.
  - **−** Strictly larger blast radius than B: 2 hooks + new marker constant + new cleanup contract.
  - **−** Migration debt: touches the JS-ported `consent_gate_grant.mjs` AND the bash `harness_continuation.sh` — both files affected by the open JS migration backlog item.
  - **−** Marker file lifecycle is a new failure surface: what if cleanup fails? Stale marker → false auto-resume on next session. Mitigation requires session-boundary cleanup (analogous to `memory_session_start.sh` cleaning `.harness_active`), which is yet more surface area.

---

## Recommendation: **Candidate B**.

Reasoning: B is **dominated only by Option A on a single axis** (constitutional footprint — A touches no hook code, only 4 markdown bodies). On every other axis (test fixture availability, drift risk across gates, reversal cost, slug-mismatch preservation, multi-turn robustness) B is equal-or-better. Option C is strictly dominated by B.

**What would flip the decision toward A:**

- If `Skill(harness)` invocation from inside a slash-command body proves to have different semantics than the model invoking it after a Stop-hook block (e.g., context-passing differences, marker visibility differences). Worth probing during `/spec` Stage 0 design.
- If the maintainer prefers locality-of-effect (the auto-resume lives next to the consent that triggered it) as a readability principle over centralization.
- If the team explicitly does not want to grow `harness_continuation.sh` ahead of the JS-port migration.

**What would flip the decision toward C:**

- Probably nothing. C is dominated by B unless the team has a hard rule against mtime arithmetic in hooks.

---

## Open questions

- **OQ-1.** Rung 4's predicate: which consent/approval tokens should it scan for "newer than harness_state"? Candidate set: `.claude/state/commit_consent`, `.claude/state/push_consent`, `.claude/state/spec_approvals/<slug>.approval`, `.claude/state/swarm_approvals/<slug>.approval`. The slug is in `workflow.json → slug` (the hook can read it). Spec should specify the exact glob/scan logic. Probably: scan the four canonical paths; pass if ANY is newer than `harness_state` mtime.

- **OQ-2.** Should `/grant-push` participate in auto-resume? `/grant-push` is a Bash-time consent for `git push` on a protected branch, not a workflow phase gate — there is no workflow phase named "push." Two sub-options: (2a) rung 4 does NOT scan `push_consent` (push-only consent never triggers auto-resume); (2b) rung 4 scans `push_consent`, harness re-enters preflight, sees no workflow phase advanced, and yields again at the same gate (idempotent no-op). Sub-option (2b) is the safer default — it preserves uniform behavior across all consent commands and trusts harness preflight to be idempotent. Spec should confirm.

- **OQ-3.** Migration interaction. `migrate-bash-python-heredocs-to-javascript-d454` (open backlog item) covers porting `harness_continuation.sh`. Three paths: (3a) ship Option B inline as bash+python expansion, accept the small migration-debt growth; (3b) bundle a JS port of `harness_continuation.sh` into this spec; (3c) defer Option B until after the JS migration ships. **Recommendation: (3a)** — the migration is a separate workflow with its own intake; bundling here scope-creeps both. The JS migration can subsume Option B's rung 4 when it lands.

- **OQ-4.** Article V wording. Current: `"the user runs the consent command, then /harness again. The next Skill(harness) invocation re-enters preflight, finds the consent-gate task with its needs_user flag still set..."`. Proposed: `"the user runs the consent command; the Stop hook detects fresh consent (rung 4) and emits a block, prompting the next Skill(harness) invocation in the same turn. The user does not need to type /harness."` Spec should pick exact wording and verify the audit-baseline count claims survive.

- **OQ-5.** Idempotency test: AC-6 in intake says `/harness` typed explicitly after a consent slash command must not double-fire. Under Option B: Stop fires on the consent turn, emits block → harness invokes, state advances. If the user then types `/harness`, the Stop hook re-fires on the next turn — but by then `harness_state.state` is `continue` (mid-loop) or `yielded` (next gate). The `mtime(consent) > mtime(harness_state)` predicate fails (harness_state was just rewritten). So rung 4 is silent on the second turn → no double-fire. Spec should codify this as an AC.

- **OQ-6.** Test fixture for mtimes. Tests for rung 4 need `fs.utimes(path, atime, mtime)` to set deterministic mtimes; FS resolution is at least 1 second on macOS HFS+ / APFS. Spec should require tests use `fs.utimes` explicitly rather than relying on natural file-creation order (which can race on fast machines).
