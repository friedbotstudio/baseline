# Security reports — drift-check-working-tree-diff

## drift-check-working-tree-diff-2026-06-03.md

# Security Review — main (drift-check-working-tree-diff) — 2026-06-03

## Summary
Overall risk: **LOW**. The change rewrites `loadDiff` in a local dev-tooling CLI (`drift_check.mjs`) to source the working-tree diff via three new `git` invocations. All invocations use `spawnSync` with array args (no shell), and the only attacker-influenced value (an untracked file path) is passed positionally after a `--` separator. No injection, traversal, or secret-exposure path of consequence was found. The script runs locally during `/tdd` against the developer's own repository.

## Findings

### [LOW] Untracked-file content read into in-memory diff via `--no-index`
- **OWASP**: A09 — Security Logging/Monitoring (info handling) | **CWE**: CWE-200 (Exposure of Sensitive Information)
- **File**: `.claude/skills/tdd/drift_check.mjs:39-50` (`untrackedDiff`)
- **Evidence**:
  ```
  const listed = spawnSync('git', ['-C', projectRoot, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
  ...
  const d = spawnSync('git', ['-C', projectRoot, 'diff', '--no-index', '--', '/dev/null', rel], { encoding: 'utf8' });
  if (d.stdout) out += d.stdout;
  ```
- **Impact**: Content of untracked files is pulled into the in-memory diff. `--exclude-standard` honors `.gitignore`/`.git/info/exclude`, so gitignored secrets (e.g. `.env`) are excluded. Only untracked-and-not-ignored files are read, and only matched `+` lines (≤120 chars) become evidence snippets in the local report at `.claude/state/drift/<slug>.md` (full content is not persisted). Local-only state file; no network egress.
- **Recommendation**: Accept as-is for dev tooling. `--exclude-standard` is the correct guard and is already present. No change required.

### [LOW] Untracked path passed to git as positional argument
- **OWASP**: A03 — Injection | **CWE**: CWE-88 (Argument Injection)
- **File**: `.claude/skills/tdd/drift_check.mjs:47`
- **Evidence**:
  ```
  spawnSync('git', ['-C', projectRoot, 'diff', '--no-index', '--', '/dev/null', rel], { encoding: 'utf8' });
  ```
- **Impact**: `rel` originates from `git ls-files` output (repo-relative untracked paths). Because `spawnSync` is invoked with an argv array (no shell) and `rel` follows a `--` end-of-options separator, a filename beginning with `-` cannot be interpreted as a git flag, and no shell metacharacters are evaluated. No exploitable argument/command injection.
- **Recommendation**: None. The `--` separator + array-arg invocation is the correct, defensive pattern.

## Dependencies
No new packages. Only Node stdlib (`node:child_process` `spawnSync`, `node:fs`, `node:path`, `node:util`) and the system `git` binary — all already in use by the prior `loadDiff`.

## Out of scope / Noted
- No index mutation: the chosen `--no-index` approach deliberately avoids `git add -N`, so it does not pollute the developer's staging area (a correctness/safety improvement over the alternative considered in the backlog).
- `/dev/null` is POSIX-specific; not a security concern, but a portability note for any future Windows consumer.

