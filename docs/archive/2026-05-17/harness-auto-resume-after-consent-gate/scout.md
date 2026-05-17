# Codebase Scout Report — harness-auto-resume-after-consent-gate

## Primary touchpoints

- `.claude/skills/harness/SKILL.md` — defines the "Resume after a `needs_user` yield" contract (currently `"the user runs the consent command, then /harness again"`). This wording is the constitutional anchor that auto-resume must reconcile. The marker-then-state ordering and three-rung Stop-hook gate are described here.
- `.claude/hooks/harness_continuation.sh:1-122` — the Stop-hook safety net. Three-rung gate at lines 26-88: rung 1 `stop_hook_active` absent (lines 27-33), rung 2 `.claude/state/.harness_active` marker present (lines 36-40), rung 3 `harness_state.state == "continue"` (lines 78-88). Sanity rail (slug mismatch → WARN) at lines 90-110. Emits `{"decision":"block","reason":"…Skill(harness)…"}` only when all three pass.
- `.claude/hooks/consent_gate_grant.mjs:42-102` — the UserPromptSubmit hook. Runs OUTSIDE Claude's tool boundary. Fast-path regex (line 47) rules out non-consent prompts. Four arms (one per gate) parse the slash command's first line, derive slug + epoch, and call `writeMarkerAtomic` to write the corresponding `.<gate>_grant` marker. Does NOT invoke `Skill(harness)` — single-purpose marker writer.
- `.claude/commands/approve-spec.md`, `approve-swarm.md`, `grant-commit.md`, `grant-push.md` — all four carry `disable-model-invocation: true` in YAML frontmatter (means: only user can invoke; Claude cannot self-issue the slash command). Body shape is uniform: precheck → derive arg → Write token → confirm to user. None of them invoke `Skill(harness)` today. None reference `workflow.json` or `harness_state`.
- `.claude/hooks/memory_session_start.sh:21-30` — cleans stale `.harness_active` marker at session boundary. Establishes the marker as session-scoped, not project-scoped.
- `.claude/state/.harness_active` — marker file. Created by harness skill on `continue`; deleted on `yielded`/`done`. **Absent at the moment a consent token is written**, because the harness already yielded before the user typed the consent command. This is the structural reason today's Stop hook stays silent in the gracefully-yielded case.
- `.claude/state/harness_state` — flat JSON, three fields (`state`, `slug`, `reason`). At the moment of consent-token write: `state == "yielded"`. Rung 3 of the Stop-hook gate fails → silent.
- `.claude/state/workflow.json` — durable workflow state. Read by harness preflight to decide entry. Survives across sessions; the marker does not.
- `.claude/state/{commit,push}_consent` and `.claude/state/spec_approvals/<slug>.approval`, `.claude/state/swarm_approvals/<slug>.approval` — consent/approval tokens themselves. Written by the slash-command body. The tokens' mtimes are the only signal "consent was written in this turn" that lives on disk after the turn ends.
- `.claude/state/.{spec,swarm}_approval_grant`, `.{commit,push}_consent_grant` — short-lived gate markers written by `consent_gate_grant.mjs`. TTL `consent.gate_marker_ttl_seconds` (default 120s). Single-use: deleted by the matching PreToolUse guard when the slash-command body's Write is allowed.
- `.claude/settings.json:41,65` — hook wiring. `consent_gate_grant.mjs` on `UserPromptSubmit`; `harness_continuation.sh` on `Stop`. Both are project-scoped (`$CLAUDE_PROJECT_DIR`).
- `CLAUDE.md` Article IV (gate semantics, lines around 130-170) and Article V (harness orchestration SOP) — both will need wording updates if the chosen option changes the documented control flow.

## Entry points that reach this code

- `UserPromptSubmit` event (user types any prompt) → `consent_gate_grant.mjs` always fires, regex fast-paths out for non-consent prompts.
- `Stop` event (Claude's turn ends) → `harness_continuation.sh` always fires; three-rung gate decides silent vs block.
- User typing `/approve-spec <arg>`, `/approve-swarm <arg>`, `/grant-commit [note]`, `/grant-push [note]` → both events fire in sequence: UserPromptSubmit writes the gate marker (before Claude is invoked), then the slash-command body executes in Claude's turn, then Stop fires.
- `Skill(harness)` invocation — by user (`/harness`), by `harness_continuation.sh`'s emitted block decision (next turn re-invoke), or by another skill calling `Skill(harness)`.

## Existing tests

- `tests/harness_continuation.test.mjs` (passing) — 8 test cases covering the three-rung gate:
  1. emits block when state=continue + marker present
  2. silent when marker absent
  3. silent when `stop_hook_active: true`
  4. silent when harness_state missing
  5. silent when harness_state malformed
  6. silent when state=yielded (← this is exactly the "consent gate yielded" case today)
  7. logs WARN on slug mismatch
  8. second fire in same turn (`stop_hook_active: true`) stays silent — bounds re-firing to one per turn
- Plus a `memory_session_start marker cleanup` describe block — tests stale marker removal.
- **No existing test for `consent_gate_grant.mjs`.** No `tests/consent*.mjs` or `tests/*gate*.mjs`. New tests for auto-resume will need a fresh fixture (UserPromptSubmit payload simulation).
- **No existing test asserting "harness auto-resumes within one turn."** Any AC in the spec phase that names "auto-resume within the same turn" needs a new test surface.

## Constraints and co-changes

- `disable-model-invocation: true` in all four consent command frontmatters — Claude cannot self-issue a consent slash command. Option (a) — chaining `Skill(harness)` from the command body — must invoke `Skill`, not re-issue the slash command. The two are distinct mechanisms.
- `stop_hook_active` Claude-Code semantic — Stop-hook block decisions are bounded to one per turn. Option (b)'s "fourth rung" must be evaluable from the Stop-hook payload, which contains `session_id`, `transcript_path`, `cwd`, `stop_hook_active` — but **not** "user's latest prompt." A rung that needs the user-prompt content cannot live in this hook.
- Marker lifecycle: `.harness_active` is removed at yield. At the moment a consent token is written, the marker is **absent**. Rung 2 of today's gate fails → silent. Any change that wants the Stop hook to fire on gracefully-yielded cases must either (i) re-arm the marker before yielding, (ii) replace rung 2 with a different condition, or (iii) add a fourth disjunctive rung that doesn't require the marker.
- Consent-token mtimes are the only on-disk signal "consent was just written" that survives the turn. Polling mtimes from a Stop hook is fragile (clock skew, FS atime semantics, racing with garbage collection).
- `consent.gate_marker_ttl_seconds` (default 120s) — the gate marker (`.commit_consent_grant` etc.) exists from UserPromptSubmit firing until the matching PreToolUse guard consumes it (when the slash-command body writes the consent token). By the time Stop fires, the gate marker is gone — so the Stop hook cannot use the gate marker's presence as a "consent just written" signal either.
- Article IV (consent gates are user-typed commands) is constitutionally load-bearing — auto-resume must compose with that, not bypass it. `consent_gate_grant.mjs` running OUTSIDE Claude's tool boundary is the structural anti-forge mechanism.
- Article V's "Resume after a `needs_user` yield" wording explicitly says "the user runs the consent command, then `/harness` again." This wording is the documentation surface that any option must update.
- The migration backlog item `migrate-bash-python-heredocs-to-javascript-d454` is open. The harness_continuation hook is bash-with-python-heredoc; further changes to this hook may want to consider whether to JS-port it inline. **Out of scope for this spec** but worth flagging — adding a fourth rung in bash+python is one option; rewriting in JS is another.

## Patterns in use here

- **Hook scripts** follow a uniform shape: source `lib/common.sh` (or import `lib/common.mjs`), read payload via `read_payload` / `readPayload`, branch on event-specific signals, emit JSON decision or stay silent. Errors are silent (`exit 0`) — hooks must never crash loudly. The JS variant (`consent_gate_grant.mjs`) imports constants like `CONSENT_MARKER_SPEC`/`SWARM`/`COMMIT`/`PUSH` from `common.mjs`.
- **Marker-then-state ordering** is documented at multiple sites (harness SKILL.md, harness_continuation.sh header, this scout's targets). Any change must preserve this ordering: marker op FIRST (atomic), then state file write.
- **Tests** use `spawnSync` + `CLAUDE_PROJECT_DIR=<tmpdir>` to invoke hooks hermetically. New tests for auto-resume should follow this pattern.
- **Consent slash command body steps** are uniform: (1) precheck (git or path), (2) derive timestamp/slug, (3) Write the token, (4) confirm to user. If option (a) is chosen, the natural insertion point is step 4 (replace "Run `/harness` to autopilot" with `Skill(harness)`).

## Risks / landmines

- **`stop_hook_active` precludes Stop-hook chaining within a turn** — already exercised by test #8 in `harness_continuation.test.mjs`. Option (b) cannot bypass this; if the Stop hook fires once on the consent-write turn and emits block, that's the auto-resume. If it stays silent because rung 2 fails, the harness never resumes — even if rung 4 would have passed. So option (b)'s fourth rung must be disjunctive with rung 2, not conjunctive.
- **The `.harness_active` marker is the "auto-fire was set up" signal.** Conflating "the workflow yielded gracefully and now consent has arrived" with "we're mid-loop and were interrupted" risks the Stop hook firing on workflows whose owner has actually given up. If we add a new condition, it must include "the workflow is still mid-flight" (e.g., not-all-non-excepted-phases-in-completed).
- **`disable-model-invocation: true` means the slash command body runs in Claude's normal context.** Inside that body, `Skill(harness)` IS callable (the model is invoking a skill, not a slash command). Option (a) is mechanically feasible — but the body's `allowed-tools` list must include the skill-invocation mechanism (`Skill` is implicit per Claude Code, not enumerated in `allowed-tools`).
- **Test coverage gap for `consent_gate_grant.mjs`** — the JS hook has no test of its own today. Any change to it (option c, or unifying option-a wiring) needs new test scaffolding; the harness_continuation pattern is the blueprint.
- **Idempotency requirement (AC-6 from intake)** — if the user types `/harness` explicitly after a consent slash command, the resume must not double-fire. Option (a)'s `Skill(harness)` call inside the command body, plus a subsequent user `/harness`, would re-enter harness preflight twice. Harness preflight is idempotent today (it reads on-disk state, decides), but the test must assert no double-tick.
- **Slug mismatch hazard** — the sanity rail in `harness_continuation.sh` already logs WARN on marker-vs-workflow slug mismatch. Auto-resume should preserve this signal; if option (a) skips the Stop hook entirely (chaining `Skill(harness)` directly), the slug-mismatch warning path is bypassed. The chosen option should preserve or relocate this safety check.
- **Article V wording is itself a test surface.** The audit-baseline check `CLAUDE.md count claims` and similar grep-based checks read this prose. Rewording Article V (e.g., "auto-resume by the chosen mechanism") must keep counts and named hook references intact.
