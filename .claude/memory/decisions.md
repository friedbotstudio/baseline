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
  - **D2 = 2C**: `.claude/hooks/memory_session_start.sh` scans for pending stages and emits a nag regardless of `.claude/state/workflow.json` presence — stages are stable infrastructure debt, distinct from memory-candidate debt.
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
