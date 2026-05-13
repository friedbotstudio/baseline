# Security reports — design-ui-orchestrator

## design-ui-orchestrator-2026-05-12.md

# Security Review — design-ui-orchestrator — 2026-05-12

## Summary

Overall risk: **LOW**. The refactor is internal-architecture only — no new user-facing endpoints, no auth/crypto surfaces, no database access, no outbound HTTP, no third-party dependencies added. The new write-boundary hook (`spec_design_calls_guard.sh`) reuses the same payload-parsing pattern as the existing 16 boundary hooks and produces no novel attack surface. Two LOW findings are noted for defense-in-depth; both apply equally to multiple sibling hooks/scripts and are not regressions introduced by this work.

## Scope reviewed

- New hook: `.claude/hooks/spec_design_calls_guard.sh`
- Extended helper: `.claude/skills/spec-lint/lint.sh` (new `check_design_calls` function and 3 glob helpers)
- Extended audit: `.claude/skills/audit-baseline/audit.sh` (4 new check rows + EXPECTED_HOOKS bump + `tdd.ui_globs` row)
- Settings wiring: `.claude/settings.json`, `src/settings.template.json`
- Config additions: `.claude/project.json`, `src/project.template.json` (added `tdd.ui_globs`, "Design calls" required section)
- Skill/governance docs: `.claude/skills/design-ui/SKILL.md` + 4 new references, `.claude/skills/tdd/SKILL.md`, `.claude/skills/spec/template.md`, `CLAUDE.md`, `src/CLAUDE.template.md`, `README.md`, `PRODUCT.md`, `docs/init/seed.md`, `src/seed.template.md`
- New tests: `tests/design-ui-classification.test.mjs`, `tests/design-ui-orchestration.test.mjs`, `tests/spec-lint-design-calls.test.mjs`, `tests/tdd-step-6.test.mjs`

The repository is not a git work tree (verified with `git rev-parse`); review uses the in-flight files captured during this workflow (`_resume.md` snapshot) and the active phase artifacts in `.claude/state/` as the change-set proxy.

## OWASP Top 10 (2021) — applicability per category

| ID | Category | Applies? | Notes |
|---|---|---|---|
| A01 | Broken Access Control | NO | No auth/role logic touched. Consent-gate enforcement (`spec_approval_guard`, `swarm_approval_guard`, `git_commit_guard`) is unmodified. |
| A02 | Cryptographic Failures | NO | No crypto code added or referenced. |
| A03 | Injection | LOW (see F-1, F-2) | Bash/Python heredoc reads JSON payload and CLI args; both have well-defined limits. |
| A04 | Insecure Design | NO | The new hook strengthens the design (closes a UI-design routing gap). Article X.2 narrows, not widens, Claude's freedom. |
| A05 | Security Misconfiguration | NO | Settings additions append one hook to an existing PreToolUse chain; no permission relaxation, no `deny`-list edits. |
| A06 | Vulnerable & Outdated Components | NO | No new packages, no `package.json` / `package-lock.json` changes; `npm audit` not applicable. |
| A07 | AuthN / AuthN Failures | NO | No auth flow exists in the baseline. |
| A08 | Software & Data Integrity Failures | NO | Hook payload is read from the harness-controlled stdin/env channel, not from network input. |
| A09 | Logging & Monitoring Failures | NO | Harness phase log (`.claude/state/harness/<slug>.log`) unchanged in shape. |
| A10 | SSRF | NO | No outbound HTTP from any added code. |

## Findings

### LOW — F-1: Path-glob acceptance of `..` traversal in hook scoping
- **OWASP**: A03 - Injection (path-traversal subclass) | **CWE**: CWE-22
- **File**: `.claude/hooks/spec_design_calls_guard.sh:35-38`
- **Evidence**:
  ```bash
  rel="${FILE#$CLAUDE_PROJECT_ROOT/}"
  case "$rel" in
    docs/specs/*.md) ;;
    *) emit_allow ;;
  esac
  ```
- **Impact**: A payload with `tool_input.file_path` containing `docs/specs/../../etc/some-readable.md` would (a) survive the prefix strip with the `..` intact and (b) match the `docs/specs/*.md` glob (the shell glob is non-rejecting on `..` segments). The Python heredoc then reads that path via `pathlib.Path(file_).read_text()`. The read is purely in-memory: nothing from it is echoed back in the deny reason, and the hook never writes. The realistic blast radius is therefore zero — the hook only *decides* allow/deny on a write Claude is already authorized for; reading an unrelated file does not exfiltrate it. Worth noting because the same pattern is reused by `spec_diagram_presence_guard.sh`, `plantuml_syntax_guard.sh`, `artifact_template_guard.sh`, and `spec_approval_guard.sh` — this is a baseline-wide nit, not a regression introduced here.
- **Recommendation**: Defer. The fix is best landed once across all spec-scoped hooks (`realpath --relative-to=$CLAUDE_PROJECT_ROOT` plus a literal-match guard against `..`/absolute paths) as its own follow-up spec. Track in `pending-questions.md` via `/memory-flush`.

### LOW — F-2: spec-lint accepts arbitrary slug argument
- **OWASP**: A03 - Injection (path-traversal subclass) | **CWE**: CWE-22
- **File**: `.claude/skills/spec-lint/lint.sh:11-17`
- **Evidence**:
  ```bash
  SLUG="$1"
  ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
  SPEC="$ROOT/docs/specs/$SLUG.md"
  ```
- **Impact**: A slug like `../../etc/passwd` would resolve `SPEC` to `$ROOT/docs/specs/../../etc/passwd.md`. The script then reads that file and runs the lint checks on its contents. Because the script is invoked manually by the user (or by `/spec` as a preflight) and runs with the user's own privileges, this is not an escalation; it just means `lint.sh` can be pointed at files outside `docs/specs/`. No write happens. Same nit class as F-1.
- **Recommendation**: Defer for the same reason as F-1. The robust fix is a `case "$SLUG" in */*|*..*|*/) exit 2 ;; esac` line near the top; equally valuable on `spec-render`, `archive`, and `audit-baseline`'s CLI-arg surfaces. Bundle as a single hardening pass.

## Dependencies

No new packages added. `package.json`, `package-lock.json`, `.mcp.json`, vendored skill licenses (`recommender`, `impeccable`, `plantuml-asl`) are untouched. `npm audit` is not invoked (no dependency delta).

## Out of scope / Noted

- **Hook chain integrity**: the new hook is appended to the PreToolUse `Write|Edit|MultiEdit` chain after `swarm_boundary_guard`. The new hook fires only when (a) the file lives under `docs/specs/`, (b) `tdd.ui_globs` is non-empty, and (c) the spec body's `write_set` intersects those globs. It cannot bypass or short-circuit upstream hooks (it only emits `deny` or `allow`; never modifies state). The hook-count cascade (20→21, 16→17) is correctly mirrored in `audit.sh` (`EXPECTED_HOOKS` set bumped), `CLAUDE.md` + template, `README.md`, `PRODUCT.md`, `seed.md` + template, and `audit.sh`'s "Article X.2 present" / "spec_design_calls_guard.sh: present + wired" rows now verify the new hook structurally.
- **Glob-helper duplication** (already flagged at `/simplify`): the three glob helpers in the hook are byte-identical to those in `lint.sh`. Consolidation requires a shared `.claude/hooks/lib/glob.py` plus a heredoc-pattern shift; separate spec.
- **Article X.2 mirror**: `tests/template-drift.test.mjs` enforces byte-equality between `CLAUDE.md` and `src/CLAUDE.template.md`. Verified PASS post-change. The mirror is the structural guarantee that `npx create-baseline` projects ship Article X.2.
- **Approval-flow slug bug** (separate, deferred): recorded in `_pending.md` and queued for `/memory-flush` promotion to `landmines.md`. Not security-relevant (it's a UX bug in the consent gate, not a bypass — the gate still blocks unforged approvals).
- **Harness yields prematurely** (separate, deferred): recorded in `_pending.md` for promotion to `pending-questions.md`. Not security-relevant.

