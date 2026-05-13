# Security reports — memory-lifecycle-closure

## memory-lifecycle-closure-2026-05-13.md

# Security Review — memory-lifecycle-closure — 2026-05-13

## Summary

LOW risk. The diff adds a local Python helper (`sweep.py`) and extends a SessionStart hook with stale-entry detection. No network surface, no new auth boundary, no new dependencies, no secrets handling. One minor observation about argument validation in a subprocess call to `git`, but the attacker would already need filesystem write access to `.claude/memory/` to exploit it — the threat model puts that out of scope.

## Method

Non-git project — reviewed the file changes directly rather than via `git diff`. Files in scope:

- `.claude/skills/memory-flush/sweep.py` (new, ~180 lines Python)
- `.claude/hooks/memory_session_start.sh` (Python heredoc modified)
- `.claude/memory/README.md` (documentation only — out of code scope)
- `.claude/skills/memory-flush/SKILL.md` (SOP markdown — out of code scope)
- `.claude/skills/memory-flush/tests/run.sh` (test harness, no production execution path)
- `.claude/hooks/tests/memory_session_start_test.sh` (test harness)

Checked: OWASP Top 10 (2021) categories, secrets hygiene, input-validation at trust boundaries (CLI args + stdin replies + filesystem paths), dependency additions (none), subprocess invocations.

No security linters configured in `project.json → lint.cmd` (null). No `bandit`/`semgrep` available; the audit-baseline test command is the binding gate and passes.

## Findings

### [LOW] git ref arguments composed from regex-extracted memory fields

- **OWASP**: A03 Injection (argv-level, not shell-level) | **CWE**: CWE-88 (improper neutralization of argument delimiters)
- **File**: `.claude/skills/memory-flush/sweep.py:106-114` (and the parallel path in `.claude/hooks/memory_session_start.sh` inside the Python heredoc)
- **Evidence**:
  ```python
  def commit_distance(root: Path, stamp: str):
      try:
          d = subprocess.check_output(
              ['git', '-C', str(root), 'rev-list', '--count', f'{stamp}..HEAD'],
              stderr=subprocess.DEVNULL, text=True,
          ).strip()
  ```
  `stamp` comes from the `verified-at:` value in a canonical memory entry, captured via `\s*-\s*verified-at\s*:\s*(.+?)\s*$`. An entry containing `verified-at: --some-git-flag` would pass `--some-git-flag..HEAD` as an argv item to `git rev-list`. `git` may interpret items starting with `-` as flags depending on the subcommand and ordering.
- **Impact**: An attacker who can write to `.claude/memory/*.md` could influence `git rev-list` behavior. Subprocess uses `args=list` (no `shell=True`), so this is **not** shell injection — git argv interpretation only. Worst realistic case: a crafted stamp could make `git rev-list` error or read unexpected refs. There is no privilege escalation; the helper runs with the invoking user's privileges.
- **Threat model**: editing `.claude/memory/` requires the same filesystem write permission as editing any baseline-internal file, so a local attacker with that level of access has far simpler attack paths. This is defensive-coding territory.
- **Recommendation**: validate `stamp` against `^[A-Fa-f0-9]{4,40}$` (or the literal `HEAD`) before passing to git. One-line guard at the top of `commit_distance` and the equivalent in the hook's Python heredoc.

### [LOW] Subprocess `git` calls inherit current `PATH` and working directory

- **OWASP**: A05 Security Misconfiguration | **CWE**: CWE-426 (untrusted search path)
- **File**: `.claude/skills/memory-flush/sweep.py:99-114`, `.claude/hooks/memory_session_start.sh` (Python heredoc)
- **Evidence**: `subprocess.check_output(['git', ...])` — git is resolved via `PATH`.
- **Impact**: A user with a malicious `PATH` shadowing `git` could run an attacker-supplied binary. This is the default Python subprocess pattern and is consistent with the rest of the hook fleet; not a regression introduced here.
- **Recommendation**: out-of-scope for this spec. Track for a future hardening pass that pins absolute paths (e.g., `/usr/bin/git`) or sets `env={'PATH': '/usr/bin:/bin'}` across the hook fleet uniformly.

## Dependencies

No new packages. Pure Python stdlib (`re`, `subprocess`, `argparse`, `datetime`, `pathlib`, `json`) + POSIX `bash`. No `npm`/`pip` lockfile changes.

## Out of scope / noted

- The interactive `y / n / skip` and `re-verify / delete / mark-closed / skip` prompts in `/memory-flush` Step 0 are driven by the operator, not by automation. No data exfil path; replies are local.
- The `verified-at:` and `last-touched:` fields are not security-sensitive — they drive a staleness indicator, not access control.
- `obj/template/manifest.json` (sha256 manifest) was regenerated as part of implement. Audit hash verification re-passes, which is the integrity mechanism Article XI provides.

## Verdict

LOW risk. Only LOW findings, both defensive-coding observations that don't gate this phase. Proceeding.

