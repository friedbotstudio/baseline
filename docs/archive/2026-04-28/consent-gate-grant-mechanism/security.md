# Security Review — consent-gate-grant-mechanism — 2026-04-28

## Summary

Overall risk: **HIGH at review time → LOW after in-slug fix.** The HIGH bypass (path-normalization via `./` prefix) was empirically confirmed during review, then **fixed in this same slug** via a `canonical_rel` helper in `lib/common.sh` applied to the four guards touched by the chore. Re-tested all three bypass variants: now blocked. Two MEDIUM findings (symlink-swap, `emit_block` exit-0 fail-open) and several LOW notes remain — deferred to the follow-up `script-based-consent-gates` chore (recorded in `docs/init/seed.md` §16 follow-up #5).

## Resolution status

- **HIGH (path-normalization bypass)**: ✅ FIXED in this slug. `lib/common.sh::canonical_rel` uses `os.path.normpath(os.path.abspath(path))` — collapses `./` and `..` lexically without resolving symlinks. Applied to `spec_approval_guard`, `swarm_approval_guard`, `git_commit_guard` (Write branch). Verified against three bypass scenarios: `./` prefix, intermediate `./`, marker self-write with `./` prefix — all now produce `permissionDecision: deny`.
- **MEDIUM (symlink swap)**: ⏸️ DEFERRED — needs broader work (paths inside `.claude/state/` should resolve symlinks; everywhere else should not). See follow-up chore.
- **MEDIUM (`emit_block` exit-0)**: ⏸️ DEFERRED — pre-existing pattern across all 16 guards; uniform fix in follow-up.
- **LOW findings**: ⏸️ DEFERRED — same follow-up.

The original full review follows for record-keeping. The HIGH section's "Recommendation" was applied verbatim (with `normpath` instead of `realpath` to avoid the symlink-swap regression noted in MEDIUM #2).


The mechanism's higher-level design is sound: `UserPromptSubmit` runs outside Claude's tool boundary, the marker file is single-use with TTL, and the slug-match prevents replay across approvals. The bypass is in the implementation layer (string-prefix path matching), not the design.

## Findings

### [HIGH] Path-normalization bypass — `./` and intermediate `.` defeat marker validation and self-write block

- **OWASP**: A01 Broken Access Control · A04 Insecure Design — control via string-equality on a non-canonical path
- **CWE**: CWE-22 (Path Traversal) · CWE-41 (Improper Resolution of Path Equivalence)
- **Files**:
  - `.claude/hooks/spec_approval_guard.sh:33` — `rel="${FILE#$CLAUDE_PROJECT_ROOT/}"`
  - `.claude/hooks/swarm_approval_guard.sh:27` — same shape
  - `.claude/hooks/git_commit_guard.sh:35` — same shape
  - `.claude/hooks/lib/common.sh:233` — `block_marker_self_write` does string `[ "$rel" = "$marker_rel" ]`

- **Evidence (empirically confirmed)**:
  ```
  PAYLOAD: tool_input.file_path = "$ROOT/./.claude/state/spec_approvals/bypass.md.approval"
  rel after stripping "$ROOT/" = "./.claude/state/spec_approvals/bypass.md.approval"
  case "$rel" in .claude/state/spec_approvals/*.approval) — DOES NOT MATCH (leading "./")
  Result: emit_allow → write succeeds with no marker validation
  ```
  Same with `$ROOT/.claude/state/./spec_approvals/foo.md.approval` (intermediate `./`).

- **Impact**: Claude can self-approve any spec, swarm plan, or commit by prefixing the approval-file path with `./`. The two-step attack is:
  1. `Write` to `./.claude/state/.spec_approval_grant` with attacker-controlled content `<slug>\n<epoch>\n` — passes through `block_marker_self_write` because the rel does not equal `.claude/state/.spec_approval_grant` literally.
  2. `Write` to `./.claude/state/spec_approvals/<slug>.md.approval` — passes through validate_consent_marker (the marker file exists with matching slug and a fresh epoch that Claude wrote in step 1).
  
  Or even simpler: skip step 1 entirely and just write to `./.claude/state/spec_approvals/<anything>.approval` — the case branch doesn't match so validate_consent_marker is never reached.

- **Recommendation**: Canonicalize `FILE` before pattern matching. The cleanest path uses python (already a hook dependency):
  ```bash
  # In lib/common.sh, helper:
  canonical_rel() {
    python3 - "$1" "$CLAUDE_PROJECT_ROOT" <<'PY'
import os, sys
file_path, root = sys.argv[1], sys.argv[2]
real = os.path.realpath(file_path)
real_root = os.path.realpath(root)
if real == real_root or real.startswith(real_root + os.sep):
    print(os.path.relpath(real, real_root))
else:
    print(real)
PY
  }
  ```
  Then in each guard: `rel="$(canonical_rel "$FILE")"`.
  
  The same canonicalization should also follow symlinks (defense against the symlink-swap attack flagged below as MEDIUM #2).

- **Severity**: HIGH despite being pre-existing, because the chore claims to fix the gate-grant bug structurally. Shipping with this bypass leaves the structural-enforcement claim materially false.

---

### [MEDIUM] Symlink swap attack on marker file

- **OWASP**: A04 Insecure Design
- **CWE**: CWE-59 (Improper Link Resolution)
- **File**: `.claude/hooks/lib/common.sh:269-301` — `validate_consent_marker` reads marker via bash `read` builtin which follows symlinks.
- **Evidence**: If Claude (or another process) creates `.claude/state/.spec_approval_grant` as a symlink to a Claude-controlled file (e.g., `.claude/state/.attacker-marker`), Claude can write the attacker file freely (it's not on the marker self-write blocklist) and the validate function reads through the symlink. The block_marker_self_write check would not catch the symlink because Claude can't write the literal marker path — but Claude *can* write the target of an existing symlink at that path.
- **Impact**: With one bug-class beyond Finding #1's path-normalization fix, Claude could synthesize a fresh marker by writing through a pre-staged symlink. Currently theoretical because creating the symlink requires another bypass; not independently exploitable.
- **Recommendation**: After Finding #1's `realpath` canonicalization, also assert `not os.path.islink(marker)` before reading. Markers should always be regular files; a symlink at the marker path is a tamper signal — log_line and emit_block.

---

### [MEDIUM] `emit_block` exits 0 with structured-JSON body — fail-open on misconfigured runtime

- **OWASP**: A05 Security Misconfiguration
- **CWE**: CWE-754 (Improper Check for Unusual or Exceptional Conditions)
- **File**: `.claude/hooks/lib/common.sh:108-119` (pre-existing pattern, not introduced by this chore)
- **Evidence**:
  ```
  emit_block() {
    python3 ... print(json.dumps({"hookSpecificOutput": {"permissionDecision": "deny", ...}}))
    exit 0  # exits zero even when blocking
  }
  ```
- **Impact**: If Claude Code's runtime ever fails to parse the JSON output (malformed JSON from an upstream bug, or a runtime version that ignores stdout), the hook exits 0 = allowed. Defense-in-depth is missing — a single layer of failure (JSON parsing) defeats the block.
- **Recommendation**: Belt-and-suspenders: emit the JSON, then `exit 2`. Per Claude Code hook protocol, exit code 2 also signals a block, and a runtime that ignores either stdout JSON OR exit code (but not both) still fails closed. Compatible change — runtimes that already parse stdout JSON ignore the exit code.
- **Severity**: MEDIUM. Pre-existing. Affects all 16 guards uniformly (not just the four touched by this chore).

---

### [LOW] `consent_gate_grant.sh` fast-path glob — false positives are tolerated, not exploited

- **OWASP**: A04 Insecure Design (informational)
- **File**: `.claude/hooks/consent_gate_grant.sh:33-39`
- **Evidence**: The fast-path glob `*'"prompt":'*/approve-spec*` matches when the substring `/approve-spec` appears anywhere after the `"prompt":` JSON key. A user pasting a URL like `https://github.com/user/approve-spec-tool` triggers the glob, then payload_get runs (extra cost), then the anchored regex `^/approve-spec[[:space:]]+...` correctly rejects the non-slash-command prompt.
- **Impact**: Performance only — no security implication. The anchored regex is the source of truth.
- **Recommendation**: No action. Document the layer-of-defense: glob is a perf gate, regex is the security gate.

---

### [LOW] Malformed JSON payload causes fail-open

- **OWASP**: A05 Security Misconfiguration
- **CWE**: CWE-755 (Improper Handling of Exceptional Conditions)
- **Files**: All 16 guards (pre-existing pattern across the harness)
- **Evidence**: `payload_get` returns empty string on JSON parse error. Subsequent `case "$TOOL" in Write|Edit|MultiEdit) ;; *) emit_allow ;; esac` matches `*)` for empty TOOL → allow.
- **Impact**: If Claude Code ever sends malformed JSON to the hooks, all guards fail open. Realistic exposure low — Claude Code constructs the payload internally.
- **Recommendation**: Add a defensive check at the top of every guard: `[ -z "$HOOK_PAYLOAD" ] && exit 2`. And: `[ -z "$TOOL" ] && exit 2`. Pre-existing across the harness; address in a separate chore that touches all guards uniformly.

---

### [LOW] `read_payload` swallows stdin failures silently

- **OWASP**: informational
- **File**: `.claude/hooks/lib/common.sh:33-37`
- **Evidence**: `HOOK_PAYLOAD="$(cat)"` — if stdin is closed or returns nothing, HOOK_PAYLOAD is empty. No detection.
- **Impact**: Same fail-open class as above.
- **Recommendation**: As above — single-line defensive `[ -z "$HOOK_PAYLOAD" ] && exit 2`.

---

### [LOW] TTL clock manipulation

- **OWASP**: A02 Cryptographic Failures (timing-related, lite)
- **CWE**: CWE-367 (race), CWE-208 (timing)
- **File**: `validate_consent_marker` uses `date +%s`
- **Impact**: An attacker with system clock control could extend marker validity indefinitely. Out of threat model — clock control implies root, which can defeat any local control. No action.

---

### [LOW] Marker content not bound to invoking session

- **OWASP**: A04 Insecure Design
- **File**: All marker-writing paths in `consent_gate_grant.sh`
- **Evidence**: The marker contains slug + epoch + (optional) path, but no session/process-id binding. A marker written by user A's session in a multi-user environment could be consumed by user B's session if they share the project directory.
- **Impact**: Multi-user shared-project setups only. Unlikely in practice (Claude Code is typically a single-user tool). Local development with one user: no impact.
- **Recommendation**: For multi-user-aware deployments, include `$$` (PID) or a session ID in the marker; validate match. Defer until a multi-user requirement appears.

## Dependencies

No new packages introduced. The hook system depends on `python3` (stdlib only) and `bash` (>= 4 per common.sh comment). No CVEs to scan.

## Out of scope / Noted

- The `emit_block` / `emit_ask` / `emit_allow` exit-0 pattern is uniform across all 16 guards. Hardening to `exit 2 + JSON` is a project-wide change deserving its own chore.
- The fail-open-on-empty-TOOL pattern is also uniform across 16 guards. Same recommendation.
- The path-normalization bypass (Finding #1) likely applies to **other** guards too — `env_guard`, `track_guard`, `tdd_order_guard`, `swarm_boundary_guard` all do `rel="${FILE#$CLAUDE_PROJECT_ROOT/}"` followed by glob/case matching. A `./` prefix could plausibly bypass any of them. Recommend extending the `canonical_rel` helper into all guards in a follow-up sweep.
- The `seed.md` Article VIII description of "Claude cannot reach the UserPromptSubmit code path" remains TRUE — the bypass is in the *write-boundary* PreToolUse layer, not the input-boundary UserPromptSubmit layer. The mechanism's higher-level design holds; the bug is in the path-matching implementation.

## Decision

Per `/security` skill: HIGH findings → do **not** mark phase complete; surface to user.

The HIGH bypass is empirically confirmed and trivially exploitable. The chore's stated goal — making the consent gates structurally un-invokable by Claude — is materially defeated until the path-normalization fix lands. Recommend fixing in this slug before proceeding to `/integrate`.
