---
owners: [any phase]
category: cross-session open questions
size-cap: 500
key: Q-NNN
verifies-against: none
---

# Pending questions

Questions the current session couldn't resolve. Surfaced at next session start so context isn't lost across yields.

Each entry's stable key is auto-numbered `Q-NNN`.

---

## Q-002

- Question: Should the spec phase require an enforceable runtime check (preflight, smoke, or error-mapping AC) for every one-time human prerequisite it identifies — instead of parking it in a Rollout-section bullet?
- Raised in: 2026-05-14 post-release. The release-workflow spec correctly identified "Pages source must be 'GitHub Actions'" in scout, research (Q-E), and spec rollout (line 553), but never wrote an AC for runtime detection. The prerequisite was missed at deploy time; failure surfaced as a misleading Jekyll build log on the repo root rather than a clear "Pages source wrong" message.
- Blocker for: deciding whether to amend the `spec` skill (or CLAUDE.md Article IV phase 4 rules) with a "silent-failure prerequisites require enforcement ACs" clause.
- Options considered:
  - (a) Amend spec skill: every Rollout prerequisite SHALL be paired with either a preflight AC or a smoke-test AC; no bare narrated prerequisites.
  - (b) Add a `spec-rollout-enforceability-review` skill (alongside diagram/traceability reviews) that scans Rollout sections and flags prerequisites without a matching AC.
  - (c) Leave it as judgment; document the heuristic in `conventions.md` instead of binding rule.
- Concrete remediation deferred: bootstrap script (`scripts/bootstrap-pages.mjs` calling `gh api -X PUT /repos/{owner}/{repo}/pages -f build_type=workflow`) and/or a preflight step in `release.yml` that fails fast when `build_type != "workflow"`.
- Verified-at: HEAD
- Last-touched: 2026-05-14

---

## Q-003

- Question: Should the Bash-matcher guards (`git_commit_guard`, `destructive_cmd_guard`, `process_lifecycle_guard`) tokenize the Bash command before pattern-matching, instead of running regexes over the raw command string?
- Raised in: 2026-05-14, during the regex over-match fix in commit `064102d`. The current `git_commit_guard` FORBIDDEN_RE pattern-matches across the whole Bash command string, which has two failure modes: (1) the original bug — paths starting with `.` falsely matched the literal-dot hard-block (fixed by commit `064102d`); (2) a remaining bug — commit messages that legitimately describe any forbidden operation (e.g., "this commit fixes a bug in `git reset --hard` handling") trigger the guard, forcing a `-F /tmp/msg.txt` workaround. Both failure modes share a root cause: regex over command-string is ambiguous about syntactic context (path vs. flag vs. quoted-string).
- Blocker for: deciding whether the next guard hardening pass is regex-tightening (cheap, incremental, still ambiguous) or a proper Bash tokenizer + argv inspection (correct, more code, needs a parser).
- Options considered:
  - (a) Status quo + workarounds: keep the regex, document the `git commit -F <file>` escape hatch in `landmines.md`, accept that operators occasionally rewrite messages.
  - (b) Regex tightening: extend the negative-lookahead approach to every alternative in FORBIDDEN_RE and add anchoring for quoted contexts. Lower bound on false-positives but does not eliminate them.
  - (c) Proper tokenizer: parse the Bash command (e.g., via `bashlex` in Python or a small in-repo tokenizer) into argv, then inspect each `git ...` invocation's argv list. Eliminates the entire false-positive class. Larger change; needs a Python dep or a hand-rolled tokenizer.
- Scope on adoption: applies to every Bash-matcher hook (`git_commit_guard`, `destructive_cmd_guard`, possibly `process_lifecycle_guard`). The decision is shared infrastructure.
- Companion landmine pending: if (a) is chosen, write a `landmines.md` entry capturing the `-F /tmp/msg.txt` workaround for commit messages that mention forbidden git ops.
- Verified-at: b327071
- Last-touched: 2026-05-21

---

## Q-006

- Question: Should `swarm.refuse_dirty_tree` default to `false` in `src/project.template.json` (shipping default for fresh installs), to match the live value we had to set in this baseline?
- Raised in: 2026-05-15. See `landmines.md → swarm-refuse-dirty-tree-blocks-mid-workflow`. The workflow's mid-flow state always leaves a dirty tree (uncommitted artifacts in `docs/intake/`, `docs/scout/`, etc.). `refuse_dirty_tree: true` aborts swarm-dispatch on the exact state the workflow produces.
- Blocker for: out-of-the-box swarm-dispatch on a fresh install of the baseline. Currently a user who runs through a full workflow with swarm enters Phase 6c and hits the abort.
- Options considered:
  - (a) Default to `false` in `src/project.template.json`. Lose the safety check on pre-workflow runs.
  - (b) Make the check phase-aware: enforce clean tree only when `.claude/state/workflow.json` is absent (no workflow in progress). Workflow-active = dirty tree expected.
  - (c) Status quo: ship `true`; surface the issue at first run and document the toggle.
- Verified-at: 3a3314e
- Last-touched: 2026-05-16

## Q-007

- Question: Should `.claude/skills/memory-flush/next-q-id.mjs` be added as a landmark in `landmarks.md`?
- Context: surfaced as a candidate during brainstorm-and-codesign Phase 10.6. The file is touched-once this session (low-frequency). landmarks.md is currently over its 500-line size-cap (513 lines), so adding another entry without pruning would extend the violation.
- Options considered:
  - (a) Add the landmark + prune one stale entry from landmarks.md in the same write.
  - (b) Skip landmark addition; the file is small (next-q-id allocator helper) and discoverable by name from `/memory-flush` SKILL.md Step 2.
  - (c) Defer to a dedicated landmarks.md pruning workflow (memory-engine-hardening v2).
- Verified-at: 8436ede
- Last-touched: 2026-05-29

## Q-008

- Question: Should `src/memory/_resume.template.md` be added as a landmark in `landmarks.md`?
- Context: surfaced as a candidate during brainstorm-and-codesign Phase 10.6. The template ships into consumer projects as the resume-snapshot skeleton; it's referenced from `memory_session_start.mjs` and `memory_pre_compact.mjs`. Same over-cap constraint as Q-007.
- Options considered:
  - (a) Add the landmark + prune.
  - (b) Skip (the template is documented in seed.md §4.5 Memory).
  - (c) Defer.
- Verified-at: 8436ede
- Last-touched: 2026-05-29
