# Security reports — harness-batch-fixes

## harness-batch-fixes-2026-08-09.md

# Security Review — harness-batch-fixes — 2026-08-09

## Summary

Overall risk: **LOW**. Six tickets reviewed individually per the `power` track's per-ticket rule; no ticket raised a BLOCKER, so the batch does not yield. The diff adds no dependency, no network call, no credential handling, and no `child_process`/`exec` surface in any of the four new modules. The two findings below are MEDIUM and LOW, both already-known and both recorded rather than discovered: the MEDIUM is an engineer-accepted design decision (D-1), and the LOW is a pre-existing pattern this diff inherits rather than introduces.

The largest integrity risk in this batch was not code but the blind 151-file string replace in T4. It was verified mechanically rather than assumed — see T4 below.

## Per-ticket verdicts (`power_batch_reviews`)

| Ticket | Write surface reviewed | Trust boundary | Verdict |
|---|---|---|---|
| T1 | `standup/{cli,render,gather}.mjs`, SKILL.md | CLI entrypoint; reads git, `.releaserc.json`, memory, roadmap | **CLEAN** |
| T2 | `code-structure/SKILL.md` | none — prose only | **CLEAN** |
| T3 | `hooks/lib/memory_session_start.mjs`, `CLAUDE.md`, template mirror | SessionStart hook output (`security.sensitive_globs` path) | **CLEAN** |
| T4 | 151 files rewritten, 9 renamed, `src/cli/workflow-migrator.js` | in-place rewrite of `workflow.json`; `.claude/commands/**` touched | **CLEAN** (1 LOW) |
| T5 | `spec/{cli,optimize}.mjs`, `template.md`, `project.json` | CLI entrypoint taking caller-supplied `--slug` reaching a path join | **CLEAN** |
| T6 | `workflows.jsonl` (+template), `project.json` (+template), 3 SKILL.md, seed | swarm dispatch routing; worker write isolation | **CLEAN** (1 MEDIUM, accepted) |

## Findings

### [MEDIUM] Swarm becomes the default code-generation route while worker isolation stays `shared`

- **OWASP**: A04 – Insecure Design | **CWE**: CWE-693 (Protection Mechanism Failure)
- **File**: `.claude/project.json` (`swarm.isolation`), `.claude/workflows.jsonl` (five `implementation` selectors)
- **Evidence**:
  ```json
  "swarm": { "max_parallel": 4, "min_tasks_worth_swarming": 1, "isolation": "shared" }
  ```
- **Impact**: T6 widens swarm dispatch from two tracks to five and lowers the threshold to one component, so the default path now runs multiple `swarm-worker` subagents concurrently in the **primary working tree**. Worktree isolation — which `seed.md:445` describes as "the swarm contract's physical safety mechanism" — is not in play. `swarm_boundary_guard`'s `write_set` enforcement becomes the *sole* barrier between two workers touching one file. A guard bug, a wave whose `write_sets` are not genuinely disjoint, or any write path that bypasses the PreToolUse hook (a subprocess writing directly) produces a silent cross-task overwrite with no filesystem backstop and no merge-audit checkpoint.
- **Status**: **Accepted by the engineer at gate A (decision D-1)**, against Claude's recommendation to flip `swarm.isolation` to `worktree`. Recorded here so the acceptance is auditable, not re-argued.
- **Mitigation in place and verified**: `swarm_boundary_guard` denies a write outside every declared `write_set` and allows the declaring task's own file — exercised by `tests/swarm-default-routing.test.mjs::test_when_two_wave_tasks_overlap_write_set_on_shared_isolation_then_boundary_guard_denies`. The wave scheduler still guarantees pairwise-disjoint `write_sets` within a wave.
- **Recommendation**: set `swarm.isolation: "worktree"`. It is a one-line config change, needs no code, and restores the barrier the swarm contract assumes. The rollback signal is already documented in the spec: any `swarm_boundary_guard` denial during a post-landing wave, or a merged file no task declared.

### [LOW] Predictable temp-file name in the atomic `workflow.json` rewrite

- **OWASP**: A08 – Software and Data Integrity Failures | **CWE**: CWE-377 (Insecure Temporary File)
- **File**: `src/cli/workflow-migrator.js:writeJsonAtomic`
- **Evidence**:
  ```js
  const tmp = `${filePath}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, filePath);
  ```
- **Impact**: the temp path is derived from the target plus the PID, so it is guessable by a process that can already write to `.claude/state/`. A pre-created symlink at that path would redirect the write. Requires local write access to the repo's own state directory — an attacker holding that can edit `workflow.json` directly, so this grants no additional capability.
- **Status**: **pre-existing, not introduced.** This diff extracted the block into a named function and added a second caller; the `writeFile`/`rename` pair and its naming are unchanged from `HEAD`. Flagged for completeness because the extraction put it on a new call path.
- **Recommendation**: no action for a local dev tool. If it is ever hardened, use `mkdtemp` or `O_EXCL`.

## What was checked and found clean

- **Secrets hygiene** — diff scanned for key/token/password/private-key patterns: none. No `.env` path touched; `env_guard` unaffected.
- **Dependencies** — `package.json` unchanged. No package added, so no CVE surface introduced. All new code is Node stdlib (`node:fs`, `node:path`, `node:util`, `node:crypto`).
- **Injection / command execution** — none of the four new modules imports `child_process` or builds a shell string. `standup/gather.mjs` retains its pre-existing `execFileSync` (argv array, no shell), unchanged by this diff.
- **Path traversal (T5, the one new caller-supplied input reaching a path join)** — `assertSafeSlug` runs in `spec/cli.mjs` *before* `join()`, and again inside `optimize.mjs`. Verified live: `../etc/passwd`, `/etc/passwd`, and `a/../../b` all refuse with `unsafe slug`, while a valid slug produces a report and a missing spec gives a distinct `ENOENT` — the three outcomes are distinguishable, so the guard is proven rather than assumed. It **rejects and never normalizes**, per the repo's standing rule that `canonicalSlug` is a normalizer and would mask a traversal by silently writing elsewhere.
- **`--root` handling** — unvalidated in both new dispatchers, matching every existing dispatcher: `dispatch()` itself sets `root: flags.root ?? process.cwd()`, so `--root` is the framework's deliberate absolute-path override. The flags that *are* validated are the sub-paths (`--spec-dir`, `--governs`). No new hole; the new code follows the established pattern.
- **T4 sweep integrity** — the blind 151-file replace is the batch's real integrity risk, so it was checked mechanically, not assumed: every tracked `.json`/`.jsonl` still parses (the single failure, `tests/fixtures/workflows-jsonl/malformed-line.jsonl`, is an intentionally malformed fixture that also fails to parse at `HEAD` and was never touched by the sweep); `.gitignore` changed in comments only; all 11 workflow tracks re-validate against I1–I11; `audit-baseline` PASSes with refreshed manifest hashes.
- **T3 hook change** — deletes output only. `buildIndex` still returns the index; no authorization, no consent path, no gate logic touched. The `activeWorkflow`/`workflowJson` bindings were retained because the resume-snapshot path still consumes them, so no unreachable branch was left behind.
- **Consent gates** — untouched. No change to `direction_approval_guard`, `swarm_approval_guard`, `git_commit_guard`, or `consent_gate_grant`. The T4 rename edited `.claude/commands/grant-commit.md` prose only (a `/memory-flush` → `/memory-sync` mention); no marker path, TTL, or slug-matching logic changed.
- **Static analysis** — no `bandit`/`semgrep`/`gosec` configured in this repo; `npm audit` not run because no dependency changed. Not installing new tools (skill constraint).

## Dependencies

No new packages. `package.json` and the lockfile are unchanged by this diff.

## Out of scope / Noted

- **T5's optimization pass is noisy on a broad `write_set`.** Run against this workflow's own spec it reports **108 undeclared / 113 reuse / 0 corrections**, because the spec's `write_set` includes `.claude/skills/**` and `overlapsWriteSet` prefix-matches every element anchored beneath it. This is faithful to AC-015 as written — those elements genuinely are touched — but a report with 108 findings trains an author to ignore it. Not a security issue and not a defect against the approved AC; worth a follow-up to weight or cap the output. Recommend a backlog entry rather than a change in this batch.
- **`swarm.isolation` remains the single highest-leverage security knob in this configuration.** Revisit it the first time a real swarm wave runs on the widened tracks.

