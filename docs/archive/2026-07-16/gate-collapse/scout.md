# Codebase Scout Report — gate-collapse (D3 / CO-E)

Scope: the consent-gate enforcement machinery, the constitutional gate-sequence text, and the harness/track wiring a "collapse the human consent gates" change must touch. Read-only map; no approach recommended (that is `/research`'s job).

## Primary touchpoints

### Consent enforcement (hooks + shared libs)
- `.claude/hooks/consent_gate_grant.mjs:48` — UserPromptSubmit trigger regex `/(approve-spec|approve-swarm|grant-commit|grant-push)/`; four sequential arms (`:55`/`:71`/`:82`/`:97`) each write a marker. Runs OUTSIDE Claude's tool boundary → markers are unforgeable. **The forge-proof anchor.**
- `.claude/hooks/lib/common.mjs:29-36` — the four marker path constants: `.spec_approval_grant`, `.swarm_approval_grant`, `.commit_consent_grant`, `.push_consent_grant` (+ `_REL` twins).
- `.claude/hooks/lib/common.mjs:211` — `validateConsentMarker(markerPath, gateLabel, cmdHint, expectedSlug='')` — the core TTL/freshness/slug checker (TTL `consent.gate_marker_ttl_seconds`, default **120s**; single-use, deletes marker on success). `:196` `blockMarkerSelfWrite`, `:149` `canonicalSlug`, `:159` `writeMarkerAtomic`.
- `.claude/hooks/spec_approval_guard.mjs:49` — gate A: allows `.claude/state/spec_approvals/<slug>.approval` write only on fresh marker; `:117-135` blocks Claude self-marking a spec `Status: Approved`; `:53-91` also blocks when shippability/checker-fanout verdict is `BLOCKED`; `:99` opt-in A4 provenance gate.
- `.claude/hooks/swarm_approval_guard.mjs:42` — gate B: guards `swarm_approvals/<slug>.approval` on the `.swarm_approval_grant` marker.
- `.claude/hooks/git_commit_guard.mjs:202` — gate C: `checkCommitConsent()` reads `.claude/state/commit_consent` (TTL `consent.commit_ttl_seconds`, default **900s**); `:340` push path (`push_consent`, TTL **300s**); `:61-89` `FORBIDDEN_RE` hard-blocks (amend/reset --hard/etc., independent of consent).
- `.claude/hooks/epic_approval_guard.mjs:70-74` — **LANDMINE (see Risks):** gates the epic `approved:false→true` flip by requiring the gate-A `spec_approvals/<slug>.approval` token to already exist. No marker/TTL of its own — it *derives authority from gate A's token*.
- `.claude/hooks/destructive_cmd_guard.mjs:56-70` — Bash-side backstop: blocks any Bash write to consent paths + epic `approved:true` (complements the Write-tool guards).
- `.claude/hooks/lib/consent-decision.mjs` — `parseCommitConsentToken:28`, `decideCommitConsent:43` (slug-scoped vs 900s time-window fallback, fail-closed), `buildGrantCommitMarkerLines:73`, `resolveWorkflow:81`.

### Provenance anchor (A4) + content hash
- `.claude/skills/spec/approval-provenance.mjs:20` — `deriveApprovalToken(...)` builds the **6-line** token; **line 6 = `ledger_ref: <entry.id>`** (the provenance anchor). Re-exports `verifyAnchor`/`parseAnchorRef`.
- `.claude/hooks/lib/approval-anchor.mjs:25` — `verifyApprovalAnchor({slug, tokenLines, ledgerPath})`, fail-safe blocks on missing/dangling/slug-mismatch anchor.
- `.claude/skills/harness/evidence-ledger.mjs:47` — `appendApprovalProvenance(...)` writes the `kind:'approval-provenance'` ledger entry the token anchors to.
- `.claude/hooks/lib/spec-content-hash.mjs:15` — `computeSpecContentHash(bytes)` (sha256); `:25` `compareSpecHash` (fail-safe false on absent/`N/A`). Standard approve-spec token line format (`.claude/commands/approve-spec.md:21-26`): L1 `APPROVED`, L2 epoch, L3 abs path, L4 git SHA or `N/A`, **L5 content hash**. Harness re-check on resume: `.claude/skills/harness/SKILL.md:140`.

### Constitutional gate-sequence text (the amendment surface — four-way mirror + annex)
- `CLAUDE.md` Article IV: table rows `:64` (gate A), `:67` (gate B), `:76` (gate C); `:84` the **"three consent gates (A, B, C)"** count statement; `:85` gate-C branch-conditional; `:86` "How the gates are structurally enforced" paragraph; hook-table rows `:201`/`:204`/`:205`.
- `src/CLAUDE.template.md` — **byte-equal full-copy mirror** of `CLAUDE.md` (identical MD5); Article IV region must receive identical edits.
- `docs/init/seed.md` — `§5` fenced phase list (gate A `:350`, gate B `:354`, gate C `:363`); **`§6` Consent model `:384` — "Four consent gates + one bootstrap + one doctor"** with per-gate table `:388-394`; `§11` git-rules gate-C `:510`; `§18.4` `requires_commit_consent` predicate `:852`; `§4.4` commands `:287`.
- `src/seed.template.md` — **splice mirror** (live head < §16 + reserved §16 + live tail ≥ §17). §5/§6/§11/§18.4 are all outside the §16 carve-out → byte-copied; regen via `npm run sync:constitution`.
- `.claude/CONSTITUTION.md` (annex): `§2` handshake `:86-88`, state-write discipline `:90-94`, per-hook detail `:100-109`, amendment-history `:35`.
- **Mirror guardrail:** `scripts/sync-constitution-mirror.mjs` (`--check` in `tests/sync-constitution-mirror.test.mjs` / `npm test`; `--write` via `npm run sync:constitution`). Adding/removing a consent predicate additionally edits `src/cli/workflows-validator-predicates.js` (§18.4 constitutional-change note).

### Harness / track wiring
- `.claude/workflows.jsonl:1` — `intake-full` DAG. **needs_user nodes: `approve-spec` (`[spec-shippability-review]`) and `grant-commit` (`[cli-copy-review]`, `condition:{name:"requires_commit_consent"}`).** `implementation` is a selector (swarm vs tdd). `:5` swarm sub-track adds `approve-swarm` (needs_user).
- `.claude/skills/triage/seed-tasklist.mjs:85` — `ctx.commitConsentRequired = !isAutonomousFeatureLanding()` — the only place ctx is set; drives whether `grant-commit` is materialized.
- `.claude/skills/triage/track-tasklist-materializer.js` ≡ `src/cli/track-tasklist-materializer.js` (byte-identical): `resolveConditions:29`, `conditionIncludesNode:46` (only `requires_commit_consent` honored; fail-safe keeps gate on), `redirectDeps:53` (reconnects DAG when a gate node drops), `CONSENT_GATE_SUBJECTS:229`.
- `isAutonomousFeatureLanding` — `.claude/hooks/lib/common.mjs:1017` (wrapper, fail-safe false); core `computeAutonomousFeatureLanding:991`.
- `.claude/skills/harness/notify.mjs:248` — `emit` (gate ping, fires only on `state==='yielded'`); `emitStop:273`, `emitAttention:316`.
- `.claude/skills/harness/consolidate-open-questions.mjs:72` — `consolidateOpenQuestions({intake, research, spec})`; renders the gate-A yield's open-questions surface. Reads `docs/{intake,research,specs}/<slug>.md`.

### Governance-class machinery (the further-collapse driver, OFF by default)
- `.claude/hooks/lib/tier-dial.mjs:161` — `classFloor(signals, opts)` → `{class, floor, tier, signals, source}`; `:152` `raiseClass` (raise-only); `GOVERNANCE_CLASSES=['D','C','B','A']:136`.
- `.claude/skills/triage/governance-class.mjs:77` — `extractSignals({writeSet, diffPaths, project})`; `CONSENT_PATTERNS:13` includes `/grant-commit/`, `/spec_approval_guard/`, `/consent_gate_grant/`.
- **Flag `governance.class.enabled` (default OFF; absent=off)** — gates the whole path (`.claude/skills/triage/SKILL.md:33`). Off → no `governance_class` written; all consumers fall back.
- `.claude/hooks/spec_design_calls_guard.mjs:42` — keys on `project.json → tdd.ui_globs`; DENYs a UI spec (write_set ∩ ui_globs) lacking a populated `## Design calls` section with Reference target + Quality criteria (CO-B / B1). Rule shared via `.claude/hooks/lib/design-calls.mjs`. **This is the machine that would enforce the CO-B reference target once the human `/approve-spec` gate is gone (intake AC4).**

## Entry points that reach this code
- User types `/approve-spec <path>` / `/approve-swarm <slug>` / `/grant-commit` / `/grant-push` → `consent_gate_grant.mjs` (UserPromptSubmit) writes the marker.
- Any Write/Edit to a `.approval` token or a `.claude/state/` consent path → the matching PreToolUse guard.
- `/triage` → `seed-tasklist.mjs` materializes the gate tasks. `/harness` loop → yields at `needs_user` tasks, fires `notify.mjs emit`.
- `git commit` / `git push` (Bash) → `git_commit_guard.mjs`.

## Existing tests
- `tests/sync-constitution-mirror.test.mjs` — mirror byte-equality (`--check`). **Will FAIL until every mirror is regenerated after an Article IV / seed edit.** Passing today.
- Consent-guard suites under `tests/` (spec_approval_guard, git_commit_guard, swarm_approval_guard, consent_gate_grant, common.mjs marker validation) — the forge-proof regression surface AC6 must keep green. (Enumerate exact files in `/research`/`/spec`.)
- `.claude/skills/audit-baseline/audit.mjs:730-737` — spot-checks template contains Article XI.2 heading; hook/skill/command counts + manifest hashes.

## Constraints and co-changes
- **Four-way mirror + annex + predicates validator move in lockstep.** `CLAUDE.md` ↔ `src/CLAUDE.template.md` (full copy), `docs/init/seed.md` ↔ `src/seed.template.md` (splice), `.claude/CONSTITUTION.md` annex, and (if a predicate changes) `src/cli/workflows-validator-predicates.js`. Regen: `npm run sync:constitution`; verify: `npm test` + `audit-baseline`.
- **Manifest regen** — any baseline-hashed file change (hooks, `notify.mjs`, materializer, `common.mjs`) requires `obj/template/.claude/manifest.json` regeneration or `audit-baseline` FAILs (Article XII).
- **`governance.class.enabled` OFF by default** — the 2→1 further collapse must be flag-gated behind it (intake AC3); the 3→2 base collapse is the off-flag default per the engineer's brainstorm decision.
- CLAUDE.md 40,000-char cap (Art. I.6) — an Article IV rewrite must stay under it; overflow narration goes to the annex.

## Patterns in use here
Guards are small single-purpose PreToolUse `.mjs` scripts that import shared logic from `.claude/hooks/lib/common.mjs` (never duplicate marker/slug logic). All consent decisions **fail closed** (deny on missing/malformed/expired). The forge-proof property rests on one invariant: the *marker* is writable only by the UserPromptSubmit hook (outside Claude's tool boundary), and every guard blocks Claude from writing the marker itself (`blockMarkerSelfWrite`). New consent flows must preserve that split. Config flags follow the "introduction-workflow" rollout (go live the workflow *after* the one that lands them) and degrade to prior behavior when absent.

## Risks / landmines
- **`epic_approval_guard` depends on the gate-A `spec_approvals/<slug>.approval` token** (`:70-74`). If the human `/approve-spec` gate — and its token — is eliminated or repurposed, the epic approval chain (`approved:false→true`) loses its authority anchor. Any redesign must keep an equivalent forge-proof token the epic guard can key on, or amend the epic guard in lockstep. **This is the sharpest coupling.**
- **"Three gates" (brief) vs "four consent gates" (seed §6).** seed.md counts `/approve-spec`, `/approve-swarm`, `/grant-commit`, `/grant-push`. The solo-flow collapse targets the two *hard* gates (approve-spec + grant-commit) plus a *soft* governance-review touchpoint = the brief's "three". `/approve-swarm` (conditional, swarm path) and `/grant-push` (Bash-time, not a workflow phase) are out of the solo collapse but must not be silently renumbered. The spec must reconcile the count against seed §6's roster.
- **Intake has no content-hash anchor.** Gate A re-yields on a post-approval spec edit via the L5 content hash (`spec-content-hash.mjs`). If approve-direction moves to intake, `docs/intake/<slug>.md` is not currently hashed — a direction approved then silently edited would not re-yield. Intake AC (open question) flags needing an intake-content-hash analog.
- **A4 token is 6 lines, standard token is 5.** `deriveApprovalToken` emits `ledger_ref` on line 6; the plain command token stops at L5. A repurposed direction-gate token must decide which shape it carries, and `governance.approval_provenance.enabled` is OFF by default (fail-closes gate A when on-but-no-ledger).
- **Selector node + `redirectDeps`.** Dropping/moving a gate node in the materializer relies on `redirectDeps` reconnecting the DAG. Moving approve-spec's node (or removing it) must not orphan `implementation`'s `depends_on:[approve-spec]` edge.
- **CI is load-bearing and will go red mid-change.** `sync-constitution-mirror.mjs --check` fails the moment `CLAUDE.md`/`seed.md` diverge from mirrors until regen — expected, but every commit in this workflow must land the regen together.
