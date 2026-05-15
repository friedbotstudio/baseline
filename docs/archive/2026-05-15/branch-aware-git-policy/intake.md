# Branch-aware git consent policy and /grant-push gate

## Problem

`.claude/hooks/git_commit_guard.sh:60` matches `\bgit\s+push\b` in `FORBIDDEN_RE` and emits an unconditional hard block for every `git push` Claude attempts, regardless of consent, branch, or user request. This creates two concrete failure modes today:

1. **Constitutional disagreement (Q-004, open since 2026-05-14).** CLAUDE.md Article VII permits push "unless the user names the exact operation in their current request"; `docs/init/seed.md` §13 says the same; but §6 + §14 + the hook itself implement an unconditional block. The user already documented the divergence; the workaround in active use is `! git push origin <branch>` typed by the user outside Claude's tool boundary. The agent cannot help with the push step of any workflow.
2. **One-size-fits-all consent on commits.** Every commit on every branch requires `/grant-commit`. This is correct for `main` and any other branch a human curates; it is friction for headless or scheduled agent runs on feature branches — every commit needs a human keystroke even when the operator's whole intent is "let it run unattended on this branch." The strict default has no escape hatch short of editing the hook.

The current hook predates any notion of branch-scoped policy. The unblocked-by-default model is wrong for automation; the blocked-by-default model is wrong for the divergence Q-004 names. Both come from the same root cause: the guard reads command syntax but never branch context.

## Goal

A branch-aware git consent policy: users declare which branches require human consent via `project.json → git.protected_branches` (glob list), the guard reads the current branch on every relevant Bash invocation, and a new `/grant-push` consent gate provides push approval symmetric with `/grant-commit` for commit approval. Default configuration preserves today's strict behavior exactly.

## Non-goals

- Cryptographic signing of consent markers (Claude-impossibility remains structural via `consent_gate_grant`'s UserPromptSubmit boundary, not crypto).
- Remote-side push hooks or server-enforced policy (a baseline is a client-side discipline).
- Multi-repo policy inheritance (each project carries its own `project.json`).
- Changing `commit_consent` TTL or single-use semantics (`/grant-commit` keeps its current shape).
- Replacing the existing hard-blocks on `--amend`, `--no-verify`, `reset --hard`, etc. (these stay unconditional).
- Per-user or per-time-window consent variants.

## Success metrics

- `audit-baseline` passes on the resulting tree (0 FAIL).
- Existing baseline tests pass (no regression on `git.protected_branches: null`).
- A demo headless run on a non-protected feature branch completes a commit + push round-trip with zero `/grant-commit` or `/grant-push` typed.
- Q-004 closed in `.claude/memory/pending-questions.md` and the closure is verified against current HEAD.
- CLAUDE.md and seed.md re-pass internal-consistency reads: §6, §13, §14 all describe the same policy.

## Stakeholders

- **Requester**: Tushar Srivastava (project owner; razieldecarte@gmail.com)
- **Reviewer**: Tushar Srivastava (single-author baseline; no separate review chain)
- **Operator**: Tushar Srivastava (runs the baseline locally and via `@friedbotstudio/create-baseline`)

## Constraints

- **Zero regression on default config.** `git.protected_branches: null` and `git.branch_pattern: null` MUST reproduce today's strict behavior bit-for-bit.
- **Invariant: every commit on a protected branch is consented.** The user pinned this. Looser policies opt in by listing fewer protected globs, not by relaxing the consent step.
- **No new hooks.** Extend `git_commit_guard` (Bash + Write legs) and `consent_gate_grant` (UserPromptSubmit). The hook count stays at 22, audit-baseline expectations stay the same.
- **Unforgeable by Claude.** Per Article VIII, only the UserPromptSubmit boundary may write the consent marker. Claude SHALL NOT be able to write `.claude/state/.push_consent_grant` or `.claude/state/push_consent` directly.
- **Bash + Write boundary coverage.** Bash leg: read current branch on every `git commit` / `git push` command and route to the right consent policy. Write leg: gate writes to the new `push_consent` state file and its marker.
- **Governance source of truth chain.** `seed.md` > `CLAUDE.md` > implementation (Article I.4). Updates land in seed.md first, propagate to CLAUDE.md, then to disk. `src/` ship-time templates mirror the on-disk files.
- **Audit accounting.** `.claude/skills/audit-baseline/audit.sh` enumerates expected hooks, commands, and state files. The new `/grant-push` command and `push_consent` state file MUST be reflected in audit expectations and the install manifest.
- **Detached HEAD case.** `git rev-parse --abbrev-ref HEAD` returns the literal string `HEAD` on detached checkout. The policy needs a defined behavior here (see Open questions).

## Acceptance criteria

1. Given `git.protected_branches: null` (default), when Claude attempts `git commit` on any branch, the guard requires a fresh `commit_consent` token (current behavior preserved).
2. Given `git.protected_branches: null`, when Claude attempts `git push` on any branch, the guard requires a fresh `push_consent` token (no longer an unconditional hard-block).
3. Given `git.protected_branches: ["main"]` and current branch `feat/foo`, when Claude attempts `git commit`, the guard allows the commit with no consent token required.
4. Given `git.protected_branches: ["main"]` and current branch `main`, when Claude attempts `git commit`, the guard denies without a fresh `commit_consent` and allows with one.
5. Given `git.protected_branches: ["main", "feat/*"]` and current branch `feat/foo`, when Claude attempts `git commit`, the guard requires a fresh `commit_consent` (the feat/* glob pulls the branch back under protection).
6. Given `git.protected_branches: ["main"]` and current branch `main`, when Claude attempts `git push origin main`, the guard denies without a fresh `push_consent` and allows with one.
7. Given `git.protected_branches: ["main"]` and current branch `feat/foo`, when Claude attempts `git push origin feat/foo`, the guard allows the push with no consent token required.
8. Given `git.branch_pattern: "^(feat|fix|chore|docs|refactor)/[a-z0-9-]+$"` and current branch `random-branch-name`, when Claude attempts `git commit`, the guard denies with an error naming the configured pattern.
9. Given `git.branch_pattern: null`, when Claude attempts `git commit` on any branch name, the branch-naming check is skipped (current behavior).
10. When the user types `/grant-push` (with or without a slug argument) in a prompt, `consent_gate_grant` writes `.claude/state/.push_consent_grant` (slug-matched, single-use, TTL from `consent.gate_marker_ttl_seconds`).
11. Given a fresh `.push_consent_grant` marker and Claude attempts to Write `.claude/state/push_consent`, the Write leg of `git_commit_guard` allows the write and deletes the marker (single-use).
12. Given no fresh `.push_consent_grant` marker and Claude attempts to Write `.claude/state/push_consent` (or `.push_consent_grant` itself), the Write leg blocks.
13. `push_consent` TTL is read from `project.json → consent.push_ttl_seconds` with default 300s (matching `consent.commit_ttl_seconds`).
14. CLAUDE.md Articles IV, VII, and VIII reflect the new policy in their tables and prose; Article XI integrity citations remain; `audit-baseline` reports 0 FAIL.
15. `docs/init/seed.md` §6 (hook table), §13 (forbidden ops), and §14 (smoke tests) all describe the same policy; the §14 smoke test list is updated to cover the new branches.
16. `.claude/skills/audit-baseline/audit.sh` enumerates `grant-push.md` in expected commands and `push_consent` in expected state files (or equivalent — see Open questions); the install manifest at `obj/template/manifest.json` includes the new command file with its sha256.
17. `src/commands/grant-push.template.md`, `src/CLAUDE.template.md`, and `src/seed.template.md` are byte-equal with the deployed files for the sections this change touches.

## Open questions

All resolved at the end of the research phase (2026-05-15). Original options are preserved in `docs/research/branch-aware-git-policy.md`; locked-in answers in **Decisions** below.

## Decisions (post-research, 2026-05-15)

- **(a) Glob matcher engine** → `picomatch` (npm). Shell-glob compatible (matches git's own ref-pattern grammar via context7 lookup), zero runtime deps, used by `chokidar`/`fast-glob` so it's already in the Node ecosystem. Replaces the Python `fnmatch` recommendation because (JS) below shifts the matching call site to Node.
- **(b) Detached HEAD behavior** → refuse all writes with an explicit error: "Detached HEAD; check out a branch first." Both `git commit` and `git push` are blocked when the current branch reads as literal `HEAD`. The hook surfaces the state instead of guessing policy.
- **(c) `branch_pattern` violation mode** → block commits only. Pushes are governed by `protected_branches` independently; cleanup workflows that push a pre-existing off-pattern branch still work. The asymmetry mirrors how naming discipline matters at branch creation, not at push time.
- **(d) `/grant-push` shape** → strictly separate from `/grant-commit`. Each command writes only its own marker; the user types both in one prompt to grant both. UserPromptSubmit fires once per turn and writes both markers in one pass. Symmetric with the existing `/approve-spec` + `/approve-swarm` separation.
- **(e) Audit accounting** → project.json key check + `EXPECTED_COMMANDS` bump only. Runtime state files (`commit_consent`, new `push_consent`) are not audited — the audit's grain stays "source-tree shape," matching how `commit_consent` is treated today. Three concrete edits: add `grant-push` to `EXPECTED_COMMANDS` (audit.sh:68), update `cmds_claimed` regex (audit.sh:174), add three rows to `expected_paths` (`consent.push_ttl_seconds`, `git.protected_branches`, `git.branch_pattern`).
- **(JS) Hook language for this work** → pilot the JS port through this intake. The two hooks we are already rewriting (`git_commit_guard`, `consent_gate_grant`) port to `.mjs` invoked as `node …mjs`. A new `.claude/hooks/lib/common.mjs` lands alongside the existing `lib/common.sh`; the 20 bash hooks keep sourcing the bash library, the two JS hooks import from the JS one. A follow-up intake will port the remaining 20 hooks as a sweep. Reasoning: we're already in these files for the policy work; touching them twice (once for policy, once for port) is the friction that kills ports.
- **Backward compatibility** → default-`null` semantics MUST apply when the key is absent, not only when present-and-explicit-null. Spec must call this out as a separate AC so the validator-side `get()` handles `undefined === null` for our purposes.

## Scope deltas introduced by these decisions

The intake's original touchpoint list expands:

- **Hook ports** — `.claude/hooks/git_commit_guard.sh` → `.claude/hooks/git_commit_guard.mjs`; same for `consent_gate_grant`. New `.claude/hooks/lib/common.mjs`. `.claude/settings.json` (two `command` strings) and `src/settings.template.json` rewire the two ported hooks from bash to `node`.
- **New runtime dep** — `picomatch` added to `package.json` dependencies (or vendored if we want zero install-time fetches; spec decides).
- **Audit tolerates mixed hook languages** — `audit.sh:131` `disk_hooks = {p.stem for p in hooks_dir.glob("*.sh")}` expands to also count `*.mjs`. The expected-hooks set is language-agnostic; only the file extension glob changes.
- **Test rewrites** — `tests/git-commit-guard-regex.test.mjs` shifts from "parse FORBIDDEN_RE out of bash via regex extraction" to "import the regex (and the branch-policy module) from the .mjs hook directly." Strictly simpler.
- **No new hooks added** — the hook count stays at 22 across both languages.

## Out of scope for this intake (deferred to follow-ups)

- Porting the remaining 20 bash hooks to JS (separate intake; this pilots the pattern).
- Cryptographic signing of consent markers.
- Remote-side push enforcement (server-side hooks).
- Q-003 resolution (Bash-matcher regex over-match) — narrowed but not closed; dropping the `git push` leg from `FORBIDDEN_RE` is partial remediation only.
- Multi-repo policy inheritance.
