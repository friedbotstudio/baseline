---
owners: [spec, rca]
category: architectural decisions
size-cap: 500
key: short slug
verifies-against: spec/rca artifact
---

# Architectural decisions

Why this repo took the path it took. Includes rejected alternatives so a future session doesn't re-litigate.

Each entry's stable key is a short slug (e.g., `subagents-vs-skills`, `worktree-isolation`).

---

## branch-aware-git-policy-2026-05-15

- Decision: replace `git_commit_guard`'s unconditional `git push` hard-block with a branch-aware policy driven by `project.json → git.protected_branches` (glob list, default `null` = every branch protected) and `git.branch_pattern` (regex, opt-out via `null`). Add a fourth consent gate `/grant-push` symmetric with `/grant-commit` for protected-branch pushes. Pilot the JS port: `git_commit_guard` and `consent_gate_grant` ported from bash to Node ESM (`.mjs`).
- Rationale: resolves Q-004 (the constitutional disagreement between Article VII's "user-named operation" carve-out and the hook's unconditional block). Unblocks headless / unattended agent runs on non-protected feature branches while keeping `main` and any configured protected glob human-gated. The JS pilot validates the port pattern on the two hooks we were already rewriting; touching the same files twice (once for policy, once for port) would have been wasted effort.
- Rejected alternatives:
  - Keep unconditional hard-block + amend Article VII to match → loses automation enablement; the hook stays Claude-impossible.
  - Prompt-sniffing `/grant-commit` with "and push" → couples push to commit consent in a non-obvious way (Q-004 option c).
  - Defer JS port to a separate intake → would re-edit the same two hook files within weeks; rejected for efficiency.
- Trade-offs accepted: branch-name discipline (`git.branch_pattern`) blocks commits only, not pushes; detached HEAD denies both with explicit error; force-push (`--force`, `--force-with-lease`) still requires user-named operation in addition to branch-policy consent.
- Source: spec at `docs/archive/2026-05-15/branch-aware-git-policy/spec.md`. Workflow archive at `docs/archive/2026-05-15/branch-aware-git-policy/`.
- Verified-at: 3a3314e
- Last-touched: 2026-05-16

## subagents-vs-skills

- Decision: collapsed 10 baseline subagents to 1 (`swarm-worker`); every other capability lives as a skill in main context.
- Rationale: subagents lose conversational context (screenshots, offhand feedback, prior rounds) and produce visibly worse output on judgment-heavy tasks (UI, code architecture, prose). Skills run in the same head as the conversation; richness is preserved. The single remaining subagent earns its keep on **physical filesystem isolation** for parallel work, which skills can't provide.
- Rejected alternatives:
  - Keep the 10-subagent fleet → ui-ux-designer empirically failing despite preloaded `impeccable` (decisions starvation).
  - Per-skill memory-bearing subagents → adds context layers that thin discipline rather than concentrate it.
- Source: this conversation, 2026-04-27 refactor.
- Verified-at: HEAD
- Last-touched: 2026-04-27

## cli-tui-presentation-layer-2026-05-18

- Decision: branded TUI ships as a presentation layer under `src/cli/tui/*` (install / upgrade / doctor / tokens), composed from the existing pure-data functions (`freshInstall`, `forceInstall`, `threeWayMerge`, `runDoctor`). `bin/cli.js` routes between tui and plain via `process.stdout.isTTY` and **dynamic** `await import('../src/cli/tui/*.js')` so `@clack/prompts` never loads on non-TTY paths.
- Rationale: empirical probe at `/tdd` Step 0 confirmed clack emits ≈41 B of Unicode framing to non-TTY stdout (it does NOT silently degrade). Loading clack on the plain path would contaminate CI / piped output and break the byte-clean regression of `tests/cli-tui.test.mjs → test_when_install_in_non_tty_then_emits_plain_output_byte_identical_to_today`. The dynamic-import seam keeps the plain path zero-byte-clack and preserves the structured/presentation split that already existed for `runDoctor` (data) and `formatReport` (text).
- Rejected alternatives:
  - Wrap `src/cli/io.js` to delegate to clack when TTY → smallest diff but largest blast radius: every `io.log` call (including non-flow status lines like "Installed manifest version 1 to …") would route through clack's visual rhythm. Bleeds clack into surfaces where plain output is deliberate.
  - Presenter interface with TTY/Plain implementations (Candidate C in `docs/archive/2026-05-18/branded-cli-tui/research.md`) → premature for three flows of ~30 LOC each; the interface drift cost outweighs the duplication cost at this scale. Reconsider if a 4th branded flow (e.g., `init-project` redesign) lands in one release cycle.
  - Eager `import '@clack/prompts'` at `bin/cli.js` top → also retired by empirical probe; would force clack to load even in pure-non-TTY invocations and was the original draft before the probe.
- Trade-offs accepted: `--merge` flag is hard-removed (not deprecation-aliased) — pre-1.0 conventions allow the break; `tests/cli.test.mjs → '--dry-run on conflict' was deleted` since it exercised the removed flag. `scripts/check-files-diff.mjs` relaxes the "dependencies must be empty" rule via an explicit `DEPS_ALLOWLIST = {'@clack/prompts'}`; future additions to that set require a spec amendment.
- Source: archived bundle at `docs/archive/2026-05-18/branded-cli-tui/` (intake, scout, research, spec, security, spec.approved).
- Verified-at: db291ed
- Last-touched: 2026-05-18

## upgrade-base-recovery-hybrid-2026-05-20

- Decision: BASE-content recovery for `create-baseline upgrade`'s three-tier merge uses a HYBRID strategy — local cache at `.claude/.baseline-prior/<rel>` is primary (read on every resolve, sha256-verified against `oldManifest.files[rel]`), with `libnpmpack.pack('@friedbotstudio/create-baseline@<baseline_version>')` as the npm fallback when the cache is absent. Cache writes-through on every successful npm fetch so subsequent upgrades short-circuit to the cache path. Failed BASE recovery (cache sha mismatch / npm fail / sha mismatch / legacy `manifest_version: 1` with no `baseline_version`) throws `NoBaseError` and routes the file to the tier-1 binary prompt — NEVER fall back to using LOCAL as BASE (security AC-008 hard rule). Companion: `baseline_version` is added to the installed manifest at fresh-install time (`src/cli/install.js → readPackageVersion` reads CLI's own package.json) so subsequent upgrades have a version anchor.
- Rationale: 95% of upgrades hit the cache → zero network. Legacy projects (manifest_version: 1, pre-rework) get a one-time fall-through to tier-1 with a clear notice. A compromised npm registry serving the recorded version is mitigated by sha256 verification (the consumer's installed manifest, written at the prior install, is the integrity anchor). Tarball extraction is bsdtar/GNU-tar-safe by default and additionally hardened by a path-resolution check.
- Rejected alternatives:
  - **npm-only re-fetch on demand** (research candidate 1A) — offline upgrade impossible; registry yank breaks even when content was previously present locally.
  - **Cache-only with no npm fallback** (research candidate 1B) — legacy cold-start (projects installed pre-rework) has no recovery path other than tier-1 fallback for every file. Hybrid keeps the cache fast path while preserving graceful resilience.
- Source: archived bundle at `docs/archive/2026-05-20/upgrade-flow-rework/` (intake, scout, research, spec, security, spec.approved). Also: `src/cli/upgrade-tiers.js → resolveBase` is the implementation.
- Verified-at: e2927c7
- Last-touched: 2026-05-20

## tier1-merge-option-design-picks

- Decision: the tier-1 upgrade prompt's fourth option is **Merge** (replacing the prior "Show diff"). When the user picks Merge, the CLI stages the INCOMING bytes BASE-less via `writeStageBaseless` under `.claude/state/upgrade/<ts>/`; reconciliation defers to `/upgrade-project` in Claude Code. Four design picks shipped together:
  - **D1 = 1A**: stage-manifest discriminator is `base_sha256: null` (JSON null literal) — three-way entries carry 64-hex, two-way entries carry `null`. `stage_version` stays at 1 (backward compatible with v0.7.0 stages, which never contain null).
  - **D2 = 2C**: `.claude/hooks/memory_session_start.mjs` scans for pending stages and emits a nag regardless of `.claude/state/workflow.json` presence — stages are stable infrastructure debt, distinct from memory-candidate debt.
  - **D3 = 3A**: reuse the existing `SEMANTIC_MERGE_STAGED` ACTION_KIND. Per-tier classification lives in the stage manifest (D1), not in the action stream — terminal label `staged for /upgrade-project` is correct for both tier-3 SEMANTIC and tier-1 Merge.
  - **D4 = 4C**: `.claude/skills/upgrade-project/SKILL.md` restructured with a classification preamble + named three-way sub-procedure + named two-way sub-procedure + shared Constraints. The zero-drift renumbering rule lives only in the three-way sub-section; the two-way sub-section explicitly disclaims it (no BASE anchor to shift against).
- Rationale: minimal new surface (no new ACTION_KIND, no new hook, no schema-version bump), preserves backward compat (v0.7.0 stages stay readable), keeps the user-facing CLI report unchanged. The architectural seam was the manifest discriminator — once `null` carries the BASE-less signal, every downstream component branches on it cleanly.
- Alternatives rejected:
  - **base_recoverable: false discriminator** (research D1-B): adds a new schema field for a binary signal that `base_sha256: null` already carries.
  - **New BASELESS_MERGE_STAGED action kind** (D3-B): violates YAGNI — terminal label is identical, internal classification is in the manifest.
  - **Sibling SessionStart hook** (D2-B): schema impact on settings.json + audit-baseline + seed.md + Article VIII is significant for a 30-line scan.
  - **Two parallel SKILL.md procedure sections** (D4-B): constraints duplication causes drift.
  - **In-tree `<rel>.upgrade` sidecar** (rejected at intake AskUserQuestion): pollutes the project tree; staged location keeps state under `.claude/state/`.
  - **project.json field for pending-merge tracking** (rejected at intake): drift risk vs filesystem truth.
- Source: archived bundle at `docs/archive/2026-05-22/tier1-merge-option/` (intake, scout, research, spec, security, spec.approved).
- Verified-at: 92e0d10
- Last-touched: 2026-05-22

## additive-baseline-version-no-manifest-bump-2026-05-27

- Decision: stamp `baseline_version` (the running CLI's `package.json` version) into `<target>/.claude/.baseline-manifest.json` AND `<target>/.claude/project.json` from every install/upgrade write path — as an **additive** field on existing schemas. `MANIFEST_VERSION` stays at 2; no schema-version bump.
- Rationale: legacy manifests lacking the field load tolerantly (`buildManifestFromDir`'s opts.baseline_version is optional per `src/cli/manifest.js:38-40`). The fast-path then activates one upgrade later, after the first post-fix run stamps the field. A schema-version bump would force a destructive migration for zero behavioral benefit.
- Rejected alternatives:
  - Bump MANIFEST_VERSION to 3 + treat missing `baseline_version` as schema mismatch → forces destructive migration for every existing consumer manifest.
  - Hash-set equivalence (compare oldManifest.files to a fresh buildManifestFromDir) instead of string-version compare → strictly correct but hashes every shipped file on every upgrade and is harder to message ("byte-identical templates" vs "already on baseline X.Y.Z"). The CLI's package version IS the causal identity of the bundled template, so string compare is sufficient.
  - Stamp baseline_version only in `.baseline-manifest.json` → leaves project.json without an inspectable version field for consumer tooling. The single extra `refreshBaselineVersion` call gives parity.
- Source: archived bundle at `docs/archive/2026-05-26/upgrade-version-aware-noop/` (spec, security, spec.approved).
- Verified-at: b5d40eb
- Last-touched: 2026-05-27

## pm-mode-engineer-mode-paired-helpers-2026-05-29

- source: user-instruction
- decision: Entry phases (`/intake`, `/spec`, `/tdd`) gain a **PM-mode brainstorm helper** at Step 0.5 that captures requirements via Socratic dialogue before any template-fill — and `/spec` separately gains an **Engineer-mode codesign** internal mode at Step 1.5 that proposes technical approaches and captures engineer verbatim rationale when overridden. The two are paired but independent: brainstorm is unconditional (opt-out via `workflow.json → skip_brainstorm`), codesign is opt-in via `workflow.json → codesign_mode`. Both ship in the same commit but serve different stages of the question-to-code path.
- verbatim:
  > "What we want is the 1st stage brainstorms with the user to capture the requirement cleanly before jumping on the solution layer. This is more important problem to solve"
  > "this is good but what I am seeing here (and you might remember) this is very close to PM mode. One additional layer we can add to the brainstorm is assisted coding feature where the actual technical solution is presented to engineer and engineer may approve or suggest an alternative. This may not be needed in all scenarios but in some complex domain problems like computer vision, or when we are designing a new algorithm etc."
- Rationale: the pre-feature intake skill walked template sections sequentially (Problem → Goal → AC), forcing premature commitment to a problem shape; solution-shaped phrasings ("make X faster") leaked through unchecked. The PM-mode helper interposes a Socratic dialogue (actor, trigger, current state, desired state, non-goals, solution-leakage detection) before any template opens. Symmetrically, `/spec` previously made all load-bearing technical decisions unilaterally based on `/research` candidates; for complex-domain problems (CV, novel algorithms, numerical methods, consensus) the engineer's expertise wasn't consulted until `/approve-spec`, which is too late to capture verbatim rationale on overrides. Engineer-mode codesign brings that dialogue forward.
- Rejected alternatives:
  - **Separate `/codesign` phase as Phase 3.5** with its own artifact `docs/codesign/<slug>.md` — user rejected during pre-triage architectural conversation; adds a phase row, triage logic, archive entry, state file for marginal separation. Unification into `/spec` Step 1.5 preserves the existing `/approve-spec` gate.
  - **Mirror design-ui's 5-stage skeleton verbatim for brainstorm** — Stage 2 semantic mismatch (brainstorm is multi-turn probing, design-ui's Stage 2 is recipe translation). Specialized 4-stage protocol chosen instead.
  - **Inline codesign mid-`/spec` drafting** — breaks the "draft each diagram first" invariant in `spec/SKILL.md:31`; harder to compose with `spec_diagram_presence_guard`.
  - **Auto-modify `workflow.json` from `/research` when codesign recommended** — violates Article II "decisions live in main context"; user remains the decider via subsequent `/triage --codesign` or manual edit.
- How to apply: when adding a new entry-point phase, gate it through `Skill(brainstorm)` at Step 0.5 with `workflow-defaults.mjs → withDefaults` for read-time defaults. When a spec author needs engineer collaboration on technical approach, set `codesign_mode: true` in `workflow.json` and `/spec` Step 1.5 fires. When `/integrate` fails with `needs spec change` AND `codesign_mode: true`, `harness/codesign-reentry.mjs` writes `revisit_context` for the next `/spec` invocation to revisit a named decision (cap 3 revisits per decision).
- Source: archived bundle at `docs/archive/2026-05-29/brainstorm-and-codesign/` (spec, security, intake, scout, research, spec.approved).
- Verified-at: 8436ede
- Last-touched: 2026-05-29

## changelog-to-whatsnew-generator-2026-06-02

- Decision: the `changelog` skill (former Phase 11.5) is renamed `whatsnew` and reclassified from a workflow phase into a new on-demand `generators` category. It emits a structured JSON fragment to `.claude/state/whatsnew/<slug>.json` (gitignored, transient, no version field) and never writes `CHANGELOG.md`, which is owned solely by `@semantic-release/changelog` in CI. An optional `project.json -> whatsnew.route_workflow` knob names a per-project routing workflow that consumes the fragment; routing is the project's concern (the baseline ships only the generator + the seam). `/init-project` actively prompts to scaffold a routing workflow (non-mandatory).
- Why: CHANGELOG.md had two writers (semantic-release version blocks + the Phase 11.5 `## [Unreleased]` curation) with no handoff, producing duplicate/drift (0.13.0 mirrored under Unreleased). Splitting machine record (CHANGELOG.md, CI) from human "what's new" narrative (generator -> per-project surface) removes the dual-ownership. "Upcoming"/version-forecasting was dropped: the site publishes alongside the npm artifact, so the version is always known at publish time.
- Rejected: (a) keep both writers + reset Unreleased at release (still dual-ownership); (b) keep the `changelog` name (confusing once CHANGELOG.md is machine-only); (c) commit the fragment (git churn + duplicates the routing target); (d) required routing knob (violates "neither path mandatory").
- How to apply: removed the `changelog` node from all 5 tracks (`commit.depends_on` -> `["grant-commit"]`, both jsonl mirrors + both materializer label maps); `SKILL_CATEGORIES` phases 11->10 + generators 1 (categories 12->13, "thirteen"); amended seed.md -> CLAUDE.md (Article IV) + src mirrors + CONSTITUTION Appendix B; `git mv` skill dir + manifest owners.skills key. The introducing workflow self-excepts its own `changelog` node (skill retired mid-run).
- Source: archived bundle at `docs/archive/2026-06-02/changelog-generator-routing/`.
- Verified-at: 8b02aa8
- Last-touched: 2026-06-02

## navigation-routing-code-browser-primary-2026-06-04

- Decision: `code-browser` is the PRIMARY navigation path for code-navigation questions in any language, over the `Explore` agent and global grep. Codified as **CLAUDE.md Article X.5** (a project-amendment): the language-agnostic universal walk (entry → imports → IO boundary) is the first attempt; broad search is the fallback only on no-resolvable-structure OR a dead-ended walk; pure full-text search and type/util lookups stay grep's domain. `seed.md §4.3` + `CONSTITUTION.md` Appendix B deframed to match; `code-browser/SKILL.md` rewritten so the universal walk is primary and `walk.mjs`/`discover.mjs` are an OPTIONAL JS/TS accelerator. Per-language fast-path adapters (Python/Go/Rust) deferred.
- Why: the primacy claim ALREADY existed in seed §4.3 + CONSTITUTION Appendix B ("prefer over grep") yet the symptom persisted in consumer installs (model reached for Explore/grep first), because the claim lived in the read-on-demand annex (not always-loaded `CLAUDE.md`), was frontend-framed (so backends self-excluded), and was silent about the Explore agent. The fix relocates it to the binding layer + deframes it. Success is outcome-based (correct answers, fewer tool calls, backend coverage), NOT "code-browser was invoked".
- Rejected: Candidate B (advisory navigation nudge in a hook) — no existing hook matches the Task/Grep tools, so it would breach the 22-hook cap for uncertain benefit; deferred unless A proves insufficient. Candidate C (description-only) — a subset of A that leaves the rule in the read-on-demand layer where it already failed to bind.
- How to apply: chose research Candidate A (binding-layer prose, no new hook). Required a binding-preserving compression of CLAUDE.md (39367 → 38491 bytes; headroom under the 40k cap went 633 → ~1500) to seat X.5 + leave room for future amendments. Mirrors: `src/CLAUDE.template.md` byte-equal; `src/seed.template.md` carries the §4.3 deframe in lockstep but is NOT byte-equal overall (§16 diverges by design). Tests: `tests/code-browser-primary-navigation.test.mjs` (11 artifact assertions) + `tests/fixtures/code-browser-nav-eval.json` (baseline `.mjs` nav-eval corpus — evidence, not a model-behavior gate). `walk.mjs`/`discover.mjs` byte-identical (non-goal). Public site `site-src/skills/core.njk` deframed (two-register).
- Source: archived bundle at `docs/archive/2026-06-04/code-browser-primary-navigation/`. Picks up backlog `code-browser-skill-dormant-only-scout-conditional-ref-9f3c`.
- Verified-at: e11e176
- Last-touched: 2026-06-04
- caveat: AC testability is artifact-checks-gate (rule present, SKILL deframed, mirrors synced, audit PASS); the behavioral "model defaults to code-browser" outcome is NOT unit-testable (model judgment) — demonstrated via the `.mjs` eval fixture, observed in practice. If A proves insufficient, Candidate B (hook nudge) is the deferred fallback. Deferred follow-up: per-language fast-path adapters (`walk.mjs` resolves only `.ts/.js/.tsx/.jsx`, not `.mjs`).

## v1-maker-checker-substrate-2026-06-06

- Decision: the v1 maker/checker execution substrate is Claude Code's dynamic **Workflow runtime** (Hybrid model): own the durable plan, the oracle/proof-obligation contract, the consent gates, and hook enforcement IN-REPO; **rent** the Workflow runtime for execution; fall back to **Mirror-lite** turn-by-turn swarm when the runtime is unavailable or disabled.
- Rationale: the runtime is **subscription-native** (counts as normal plan usage, NOT Agent-SDK/API billing), gives deterministic code-driven control flow (what Article II + the v1 vision want), worktree isolation per agent, and schema-validated structured output. PoC this session (3 workflow runs) confirmed all three axes: the maker→checker round-trip works; a checker produced a grounded finding (a failing test, reproduced independently outside the workflow); and the constitutional PreToolUse hooks FIRE on workflow agents (`tdd_order_guard`, `verify_pass_guard`, `swarm_boundary_guard` each blocked a workflow-agent write with a verbatim message) — so makers ride the rented runtime under full governance.
- Rejected alternatives:
  - **Agent-SDK orchestrator (Mirror-true)**: subscription ToS forbids driving the SDK with subscription credentials; per-token API billing detonates the economics of a token-heavy multi-agent loop. Breaks the flat-rate model the baseline depends on.
  - **Agent teams**: teammates CANNOT spawn subagents (verified against `code.claude.com/docs`), and teammates share one working dir with no worktree isolation.
  - **Mirror-lite only** (model-driven turn-by-turn): forgoes deterministic code-driven orchestration; retained as the FALLBACK, not the substrate.
- Source: freeform PoC archived at `docs/archive/2026-06-05/maker-checker-poc/` (brief.md, spec.md). Vision + 8-piece decomposition at `docs/vision/baseline-v1-thought-compiler.md` Part 5. Backlog `-c732` (minimal exception — OPEN, pending the intake-full corroboration workflow), `-9360` (full charter).
- Verified-at: a63bbbe
- Last-touched: 2026-06-06
- caveat: the `§II.A` amendment that LEGALIZES this is NOT yet approved or committed — a fresh intake-full workflow will scout + research (external corroboration of the maker/checker + oracle-grounding patterns) before producing an approvable amendment. Decision recorded now to prevent re-litigating the agent-teams / Agent-SDK alternatives. When applying that amendment, heed `landmines.md → constitutional-amendment-tripwires-headroom-seedmirror-python3ledger` (CLAUDE.md 38,500-byte budget, seed.template parity, python3 ledger).
