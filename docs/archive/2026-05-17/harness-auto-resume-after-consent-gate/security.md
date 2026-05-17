# Security reports — harness-auto-resume-after-consent-gate

## harness-auto-resume-after-consent-gate-2026-05-17.md

---
slug: harness-auto-resume-after-consent-gate
date: 2026-05-17
reviewer: claude (security skill)
base-branch: main
diff-size: 4 files, +292 / -36 (328 lines net)
---

# Security Review — harness-auto-resume-after-consent-gate — 2026-05-17

## Summary

**Overall risk: LOW.** The diff adds a disjunctive Stop-hook rung (rung 4) that fires when a workflow is mid-flight, the harness has yielded, and a consent/approval token has been written more recently than `harness_state`. The hook emits a `{decision: "block"}` JSON object that prompts Claude to re-invoke `Skill(harness)` in the same turn. The hook is read-only against state files and emits no writes. Three LOW findings are defense-in-depth observations: all require an attacker to already hold write access to `.claude/state/` or shell privileges, which dominate the proposed attack surface in their own right.

## Findings

### [LOW] workflow_slug from workflow.json is not validated before path concatenation

- **OWASP**: A03 — Injection | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/hooks/harness_continuation.sh:117-126`
- **Evidence**:
  ```python
  if workflow_slug:
      candidates.append(
          os.path.join(state_dir, 'spec_approvals', f'{workflow_slug}.approval')
      )
      candidates.append(
          os.path.join(state_dir, 'swarm_approvals', f'{workflow_slug}.approval')
      )
  for path in candidates:
      try:
          if os.path.getmtime(path) > reference_mtime:
              return True
  ```
- **Impact**: An attacker who can write to `.claude/state/workflow.json` could set `slug` to `"../../../../etc/passwd"` or similar; `os.path.join` does not normalize, so `os.path.getmtime` would read the mtime of an arbitrary file. The leak is mtime-only (no content disclosure), and the attacker already has filesystem write access (a higher privilege than the leak), so the practical impact is minimal. Inclusion is for defense in depth.
- **Recommendation**: Add `import re` and validate `if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', workflow_slug): workflow_slug = ''` after the read, OR rewrite the path build to use `os.path.basename(workflow_slug)` to strip directory components. Either is a 2-line fix.

### [LOW] mtime freshness can be refreshed by Bash `touch` without invoking consent_gate_grant

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-345 (Insufficient Verification of Data Authenticity)
- **File**: `.claude/hooks/harness_continuation.sh:90-103`
- **Evidence**:
  ```python
  def _any_consent_newer_than(reference_mtime, workflow_slug):
      ...
      for path in candidates:
          try:
              if os.path.getmtime(path) > reference_mtime:
                  return True
          except OSError:
              continue
      return False
  ```
- **Impact**: Rung 4's freshness predicate is `mtime(consent) > mtime(harness_state)`. The consent token's content (line 1: epoch timestamp written by the slash-command body) is the canonical signal of "consent was just granted," but rung 4 only inspects mtime. A `touch .claude/state/commit_consent` Bash invocation (or `os.utime` equivalent) would update mtime without invoking the `consent_gate_grant` UserPromptSubmit hook, false-triggering rung 4. Claude would need Bash permission to execute the `touch` (the user grants this explicitly). The downstream harness invocation cannot proceed past the gate consent check inside `Skill(harness)` preflight — the approval token must exist on disk too — so the worst case is a no-op harness invocation, not a privilege escalation.
- **Recommendation**: Optional hardening — additionally parse the consent token's first-line epoch and require it `> mtime(harness_state)`. This costs ~6 lines of Python and removes the touch-attack surface. Not blocking for this diff.

### [LOW] Consent-token mtime read follows symlinks

- **OWASP**: A08 — Software & Data Integrity Failures | **CWE**: CWE-59 (Improper Link Resolution Before File Access)
- **File**: `.claude/hooks/harness_continuation.sh:101`
- **Evidence**:
  ```python
  if os.path.getmtime(path) > reference_mtime:
      return True
  ```
- **Impact**: `os.path.getmtime()` follows symlinks. If an attacker replaces `.claude/state/commit_consent` with a symlink to an attacker-controlled file with a recent mtime, rung 4 fires. The attacker already needs write access to `.claude/state/` to plant the symlink, and that access lets them overwrite `harness_state` directly with a state of their choosing — which dominates the symlink attack. Inclusion is for defense in depth and parity with the consent-gate hardening notes in `docs/init/seed.md §14.5`.
- **Recommendation**: Optional hardening — assert `not os.path.islink(path)` before `getmtime`, OR use `os.lstat(path).st_mtime` to get the symlink's own mtime rather than the target's. Marginal hardening; tracked in the broader consent-gates hardening sweep already on the seed-md follow-ups list.

## Dependencies

No new packages added. Python stdlib only (`json`, `os`, `sys`, `time`, `os.path.getmtime`, `os.path.exists`). `package.json` unchanged.

## Out of scope / Noted

- **A09 (Logging) review**: rung-4 log lines (`emit: decision=block (Path B ...)`, `silent: rung4 no consent token newer than harness_state`, `silent: rung4 workflow.json missing or unparseable`) are appended to `harness_continuation.log`. Log lines include slug strings and exception text; no secrets logged. Slugs are derived from intake titles by `/triage` and are not sensitive.
- **Consent-bypass primitive analysis**: the user explicitly asked whether rung 4 introduces a way for Claude to trigger auto-resume without the user typing the slash command. Verdict: NO. Rung 4 fires on mtime of consent tokens, which Claude can only write through the `consent_gate_grant` → slash-command-body → `*_consent_guard` chain. Claude cannot forge the `.commit_consent_grant` UserPromptSubmit-hook-written marker (per Article IV). The mtime-touch attack (LOW finding 2) requires explicit Bash permission AND fails to satisfy the downstream `Skill(harness)` preflight consent check, so it's a no-op DoS at most.
- **`stop_hook_active` one-fire-per-turn bound**: confirmed via test `test_rung4_silent_when_stop_hook_active`. Rung 4 cannot be used to chain Stop-hook blocks within one turn.
- **Race window analysis**: Claude Code's lifecycle serializes UserPromptSubmit → slash-command body → Stop, so there is no TOCTOU race between consent-token write and rung-4 read. The mtime comparison is a single syscall against state already on disk.
- **`migrate-bash-python-heredocs-to-javascript-d454`** (open backlog): all three LOW findings would carry into the JS port unmodified. Worth bundling them with the migration's harden pass; the seed.md §14.5 consent-gates sweep is the natural home.
- **No security linters configured** for shell or Python. `project.json → test.cmd` is the audit script (structural drift), not vulnerability scan. The findings here come from manual OWASP walk-through, not tooling.

