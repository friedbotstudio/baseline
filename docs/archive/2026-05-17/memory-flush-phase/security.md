# Security reports — memory-flush-phase

## memory-flush-phase-2026-05-17.md

# Security Review — memory-flush-phase — 2026-05-17

## Summary

Overall risk: **LOW (no findings).** The change is workflow-internal plumbing: markdown SOP edits (constitution, mirrors, 5 baseline skills) plus a ~21-line edit to `.claude/hooks/memory_session_start.sh` and a new test file. No new authentication, authorization, network surface, persistence layer, dependency, MCP server, or third-party API. The hook's new logic is an existence check on `.claude/state/workflow.json` plus a Python f-string interpolating an integer counted from a local file's regex match. No tainted user input flows reach the new code paths.

## Findings

*(none — see "Reviewed surfaces" below for what was checked)*

## Reviewed surfaces

### `.claude/hooks/memory_session_start.sh:144-181` — debt-mode nag

- Change: replaces the legacy K>0 / K=0 binary nag with a three-scenario decision tree that branches on `workflow.json` presence.
- Trust boundary: the hook runs at SessionStart inside Claude Code's hook boundary. The output is `hookSpecificOutput.additionalContext` (markdown injected into Claude's startup prompt).
- Tainted inputs: none new. `pending_count` is an integer counted via regex `^##\s+CANDIDATE\b` against `_pending.md` body content; `active_workflow` is `workflow_json.is_file()`. Both are local-filesystem reads.
- Injection: the new line interpolates `pending_count` (a Python int) and `plural` (a 1-character string literal `''` or `'s'`) via f-string into a markdown line. No shell-eval, no subprocess, no SQL, no HTML escape requirement (markdown rendering in additionalContext is controlled by Claude Code, not by attacker-controlled bytes).
- The pre-existing `subprocess.check_output(['git', '-C', str(root), 'rev-parse', '--short', 'HEAD'], ...)` and the equivalent `rev-list --count` call (lines 49, 70) use explicit arg lists — no `shell=True`, no string concatenation. Unchanged by this diff.

### `.claude/skills/{harness,triage,memory-flush,commit,chore}/SKILL.md` — prose edits

- Constitutional SOP markdown. No executable code. Edits add bullet points / table rows / step entries describing Phase 10.6 semantics.
- The `Skill(memory-flush)` invocation in chore SKILL.md Step 6.5 calls a vendored baseline skill via the Skill tool — no shell, no eval.
- Commit SKILL.md prereq tightening (requires `memory-flush` AND `archive` in completed) is a *positive* control improvement: it adds a structural gate before commit, not weakens one. Out of scope of OWASP categories but worth noting as a hardening.

### `.claude/memory/pending-questions.md` — Q-001 closure

- Added `Resolution:` prose line + structured `resolved-at: 2026-05-17` field. Both are static text. The `resolved-at` is the trigger for sweep.py's auto-close at Phase 10.6.
- No user input path. The closure mechanism (sweep.py `--mode auto-close`) was shipped 2026-05-13 (memory-lifecycle-closure spec, archived) and was already security-reviewed at that time.

### `obj/template/manifest.json` — build artifact

- Regenerated via `scripts/build-manifest.mjs`. Contains sha256 hashes of baseline-skill files (cryptographic integrity for the `npx @friedbotstudio/create-baseline upgrade` path, per Article XI). The hashing operation is `hashlib.sha256` (Python stdlib in audit / `node:crypto` in the manifest builder) over file bytes. Standard usage, no findings.

### `tests/memory-flush-phase.test.mjs`, `.claude/skills/memory-flush/tests/run.sh` — test fixtures

- Test code uses `fs.mkdtemp` for tmp dirs (mkstemp pattern, safe), `spawnSync` with explicit arg arrays (no `shell: true`, no string concat for cmd), and `JSON.stringify` for input piped through stdin. No remote calls, no eval. The bash test harness uses `set -uo pipefail` and `mktemp -d` per existing conventions.

## Secrets hygiene

- `git diff | grep -iE "(api[_-]?key|secret|token|password|private[_-]?key|aws_|AKIA|BEGIN.*PRIVATE)"` matched only the prose phrase "consent token" in CLAUDE.md / commit SKILL.md, which refers to the existing `commit_consent` workflow token (not a secret). No hardcoded credentials, API keys, or private keys added.
- `git diff | grep -E "\.env"` returned no matches.

## Dependencies

No new npm / pip / system packages introduced. `package.json`, `package-lock.json`, `requirements.txt`, `go.mod` not modified. The audit-baseline + node --test + bash tests all run on stdlib + existing dev deps.

## Out of scope / Noted

- **Hardening note (informational).** The new commit-skill prereq requiring `memory-flush` in `completed` adds a structural gate at Phase 11. Together with the existing `git_commit_guard` (Bash-time consent enforcement) and `track_guard` (Write-boundary phase ordering), Phase 11 now requires three independent checks to pass before any commit lands. This is a small positive change to defense-in-depth around the commit boundary.
- **Pre-existing observation, not in this diff.** `memory_session_start.sh:48-55` reads `git rev-parse --short HEAD` via `subprocess.check_output` with explicit args; safe. The same pattern is used at lines 70-77 (`git rev-list --count`). No string-concat injection surface. Both pre-date this diff.
- **No security linters configured.** Project does not declare `bandit`, `semgrep`, `gosec`, `pip-audit`, or `npm audit` in test.cmd. The binding test (`bash .claude/skills/audit-baseline/audit.sh`) verifies structural drift, not vulnerability scanning. Adding `npm audit` to the audit-baseline gate could be a follow-up if dependency hygiene becomes a concern; not blocking for this diff.

