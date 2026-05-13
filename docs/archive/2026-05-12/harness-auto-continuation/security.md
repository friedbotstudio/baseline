# Security reports — harness-auto-continuation

## harness-auto-continuation-2026-05-12.md

# Security Review — harness-auto-continuation — 2026-05-12

## Summary

Overall risk: **LOW**. Three LOW findings, all defense-in-depth observations rather than exploitable vulnerabilities. No CRITICAL/HIGH/MEDIUM findings. The new Stop hook fails closed on every error path; Article IV consent gates remain enforced by the pre-existing `consent_gate_grant` + `spec_approval_guard` / `swarm_approval_guard` / `git_commit_guard` chain (byte-identical to pre-refactor: mtimes confirm none were modified). A forged `harness_state` file can cause at most one extra harness tick — it cannot bypass a consent gate, escalate privileges, or persist code, because the harness consults `workflow.json` + TaskList + approval-token files (not `harness_state`) to decide what phase to run.

## Findings

### [LOW] `harness_state` write is non-atomic

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-362 (Concurrent Execution using Shared Resource without Proper Synchronization)
- **File**: `.claude/skills/harness/SKILL.md:48-50` (and equivalent heredoc patterns in `integrate`, `simplify`, `chore`, `tdd` SKILL.md)
- **Evidence**: SOPs describe the write as a flat-JSON overwrite without naming an atomic write-then-rename pattern. The new `verify` contract doc mentions atomicity in passing ("prefer write-then-rename for atomicity when the writer needs guarantees") but the harness SOPs do not require it.
- **Impact**: A phase skill that crashes mid-write could leave `harness_state` partially written (truncated JSON). Rung 3 (`python3 json.load`) catches this and exits silent, so the hook fails closed. The Stop hook does not re-fire — the user simply types `/harness` to resume manually. No security boundary crossed.
- **Recommendation**: Surface as advisory only. Phase skills run sequentially (single writer per turn), and the freshness check (rung 4) plus the malformed-JSON check (rung 3) both fail safely. Optionally add a "prefer atomic write" note to harness SOP; do not block.

### [LOW] No slug cross-check between `harness_state` and `workflow.json`

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-345 (Insufficient Verification of Data Authenticity)
- **File**: `.claude/hooks/harness_continuation.sh:55-95` (the python heredoc)
- **Evidence**: The hook reads `harness_state.slug` but does not verify it matches `.claude/state/workflow.json → slug`. A stale `harness_state` from a prior workflow with state=continue and a fresh `written_at` could theoretically re-fire the harness during a different workflow's run (or a session with no active workflow).
- **Impact**: Bounded. If no active workflow, harness's preflight detects this and stops with a clear message. If a different workflow is active, harness invokes the next pending phase of that workflow (it consults workflow.json, not harness_state). The forged `harness_state.slug` is never used as a decision input.
- **Recommendation**: Optional defense-in-depth — add a rung 2.5 that reads `.claude/state/workflow.json → slug` and silently exits when it doesn't match `harness_state.slug`. Today's blast radius is "one extra harness tick on the active workflow," which is identical to user typing `/harness` an extra time. Surface as advisory.

### [LOW] `tick_count` cap relies on phase skill discipline

- **OWASP**: A05 - Security Misconfiguration | **CWE**: CWE-1284 (Improper Validation of Specified Quantity in Input)
- **File**: `.claude/skills/harness/SKILL.md:51, 56`, and the per-phase `harness_state` writers in `integrate`, `simplify`, `chore`, `tdd`
- **Evidence**: The harness and phase SOPs say "write `tick_count + 1`" but this is markdown prose, not code-enforced. A phase skill that incorrectly writes a constant `tick_count: 0` defeats the runaway-loop cap (rung 5).
- **Impact**: A runaway loop would burn Claude API tokens within a single Claude Code session. Bounded by Claude Code's own turn limits and the user's manual `/clear` or process kill. No data corruption, no credential exposure, no consent bypass.
- **Recommendation**: Optional — have the Stop hook itself increment a counter and write it back to `harness_state`, instead of trusting the phase skill's increment. Today's risk is "phase skill bug burns tokens," which is detectable by the user within a few ticks. Surface as advisory.

## Dependencies

No new packages. The work uses only `bash` (system) + `python3` stdlib (system). No npm, pip, or other package additions. Article IX vendored skills (`humanizer`, `impeccable`, `code-structure`, etc.) are untouched.

`npm audit` would not reveal anything new since no `package.json` dependencies changed.

## Out of scope / Noted

- **Article IV consent gate chain integrity verified.** `mtime` of `consent_gate_grant.sh`, `spec_approval_guard.sh`, `swarm_approval_guard.sh`, `git_commit_guard.sh`, `verify_pass_guard.sh` all predate this slug's work (May 12 11:57-11:58 from the prior `approval-slug-canonicalization` chore, plus Apr 29 / Apr 27 originals). None were touched in this refactor. Byte-identity guarantees the gates' behavior is unchanged.
- **No consent-marker writes in the new hook.** `grep -nE "_approval_grant|_consent_grant|spec_approvals|swarm_approvals|commit_consent" .claude/hooks/harness_continuation.sh` returns no matches.
- **No shell injection vectors.** `grep -nE "\beval\b|\bexec\b|\$\(.*\\\$|backtick" .claude/hooks/harness_continuation.sh` returns no matches. The python heredoc uses `<<'PY'` (quoted), so no bash variable interpolation inside; values pass through environment (`HARNESS_STATE`, `PROJECT_JSON`, `LOG_PATH`) which are themselves constructed from `lib/common.sh` constants, not user input.
- **No file-permission escalation.** Hook is `chmod 0755` (world-readable + executable, owner-writable). Matches every other hook in the fleet.
- **`harness_state` does not act as a consent token.** It is a continuation signal only. The harness's authority to invoke `Skill(<phase>)` derives from the spec approval token, the swarm approval token, or the absence of any required gate for the next pending task — all of which are read from their canonical locations (`spec_approvals/`, `swarm_approvals/`, `commit_consent`) on every harness tick, not from `harness_state`.
- **Test isolation.** `tests/harness_continuation.test.mjs` uses `os.tmpdir()` + `fs.mkdtemp` for fixtures and `CLAUDE_PROJECT_DIR=<tmp>` env override for hook invocation. The live `.claude/state/` is never mutated by tests. No race between test runs and live harness state.
- **Stop hook timeout budget.** Claude Code default hook timeout is 60 s. The new hook's heaviest path is one `python3` invocation that reads two JSON files (each < 1 KB) and writes one log line — single-digit milliseconds. Well within budget even on slow filesystems.

