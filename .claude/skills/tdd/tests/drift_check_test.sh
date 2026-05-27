#!/usr/bin/env bash
# Fixture-based integration tests for the drift_check.mjs helper.
# Covers AC-002, AC-003, AC-004, AC-011 (and OQ-4) from
# docs/specs/workflow-loop-closing-hygiene.md.
#
# Contract under test (drift_check.mjs):
#   node .claude/skills/tdd/drift_check.mjs --slug <slug> \
#           [--project-root <path>] [--diff <path>]
# Reads docs/specs/<slug>.md, scores every numbered AC + ## Design calls row
# against either git diff or the --diff override, writes a markdown report at
# .claude/state/drift/<slug>.md inside the project-root. Exits:
#   0 — zero unresolved
#   1 — >=1 unresolved
#   2 — tool error (missing args, IO, etc.)
# Special case: missing spec at the named slug exits 0 with "no spec; skipped"
# on stdout and writes no report (chore-track support per AC-011).

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
DRIFT="$REPO_ROOT/.claude/skills/tdd/drift_check.mjs"

PASS=0; FAIL=0; FAILED=()

fail() { echo "  FAIL: $*"; return 1; }

assert_file_contains() {
  local path="$1" needle="$2" msg="$3"
  if grep -qF "$needle" "$path" 2>/dev/null; then return 0; fi
  fail "$msg :: file $path missing: $needle"
}

assert_contains() {
  local haystack="$1" needle="$2" msg="$3"
  case "$haystack" in
    *"$needle"*) return 0 ;;
    *) fail "$msg :: expected to contain: $needle" ;;
  esac
}

# Run drift_check.mjs against a synthetic project-root, setting $OUT (combined
# stdout+stderr) and $EXIT in the caller's scope. Called without command
# substitution so the assignments survive into the test function.
run_drift() {
  local root="$1" slug="$2" diff_path="${3:-}"
  if [ ! -f "$DRIFT" ]; then
    OUT='{"error":"drift_check.mjs missing"}'
    EXIT=127
    return
  fi
  local args=( --slug "$slug" --project-root "$root" )
  [ -n "$diff_path" ] && args+=( --diff "$diff_path" )
  OUT="$(node "$DRIFT" "${args[@]}" 2>&1)"
  EXIT=$?
}

# Build a minimal synthetic project-root with docs/specs/<slug>.md present.
# $1 = root, $2 = slug, $3 = AC list (newline-sep `AC-NNN`), $4 = design-calls body
seed_project() {
  local root="$1" slug="$2" acs="$3" dc="$4"
  mkdir -p "$root/docs/specs" "$root/.claude/state"
  {
    printf '# Spec — %s\n\n' "$slug"
    printf '## Goal\n\nMinimal synthetic spec for drift_check tests.\n\n'
    printf '## Design\n\nN/A\n\n'
    printf '## Design calls\n\n%s\n\n' "$dc"
    printf '## Acceptance criteria\n\n| ID | Criterion | Upstream | Sequence |\n|---|---|---|---|\n'
    while IFS= read -r ac; do
      [ -z "$ac" ] && continue
      printf '| %s | given X, when Y, then Z | upstream | §Behavior #1 |\n' "$ac"
    done <<< "$acs"
    printf '\n## Test plan\n\nN/A\n'
  } > "$root/docs/specs/$slug.md"
}

# Synthesize a diff file. $1 = path, $2 = lines (literal text).
seed_diff() {
  printf '%s' "$2" > "$1"
}

today() { date -u +%Y-%m-%d; }

run() {
  local name="$1"
  echo "RUN  $name"
  if "$name"; then
    PASS=$((PASS+1)); echo "PASS $name"
  else
    FAIL=$((FAIL+1)); FAILED+=("$name"); echo "FAIL $name"
  fi
}

# --- AC-002, AC-004 -----------------------------------------------------------

test_when_drift_check_on_spec_with_all_resolved_then_exit_0() {
  local root; root="$(mktemp -d)"; trap "rm -rf $root" RETURN
  seed_project "$root" "wf-all-resolved" "AC-001
AC-002" "*(none)*"
  # Diff carrying test names that reference AC-001 and AC-002 substrings.
  local diff_path="$root/diff.txt"
  seed_diff "$diff_path" "+def test_when_AC-001_satisfied_then_x_works(): pass
+def test_when_AC-002_satisfied_then_y_works(): pass
"
  OUT=""; EXIT=0
  run_drift "$root" "wf-all-resolved" "$diff_path"
  if [ "$EXIT" -ne 0 ]; then
    fail "AC-002 expected exit 0 (all resolved), got $EXIT; stdout: $OUT"
    return 1
  fi
  local report="$root/.claude/state/drift/wf-all-resolved.md"
  [ -f "$report" ] || { fail "AC-002 report not written at $report"; return 1; }
  assert_file_contains "$report" "AC-001" "AC-002 report missing AC-001" || return 1
  assert_file_contains "$report" "AC-002" "AC-002 report missing AC-002" || return 1
  assert_file_contains "$report" "resolved" "AC-002 report missing resolved verdict" || return 1
}

# --- AC-003 -------------------------------------------------------------------

test_when_drift_check_finds_unresolved_then_exit_1() {
  local root; root="$(mktemp -d)"; trap "rm -rf $root" RETURN
  seed_project "$root" "wf-unresolved" "AC-99" "*(none)*"
  local diff_path="$root/diff.txt"
  # Diff has no reference to AC-99 anywhere.
  seed_diff "$diff_path" "+def test_when_unrelated_then_ok(): pass
"
  OUT=""; EXIT=0
  run_drift "$root" "wf-unresolved" "$diff_path"
  if [ "$EXIT" -ne 1 ]; then
    fail "AC-003 expected exit 1 (>=1 unresolved), got $EXIT; stdout: $OUT"
    return 1
  fi
  local report="$root/.claude/state/drift/wf-unresolved.md"
  [ -f "$report" ] || { fail "AC-003 report not written at $report"; return 1; }
  assert_file_contains "$report" "AC-99" "AC-003 report missing AC-99" || return 1
  assert_file_contains "$report" "unresolved" "AC-003 report missing unresolved verdict" || return 1
}

# --- AC-002 boundary, AC-011 --------------------------------------------------

test_when_drift_check_no_spec_then_exit_0_skipped() {
  local root; root="$(mktemp -d)"; trap "rm -rf $root" RETURN
  # No spec file is created at docs/specs/<slug>.md.
  mkdir -p "$root/docs/specs" "$root/.claude/state"
  OUT=""; EXIT=0
  run_drift "$root" "nonexistent-slug"
  if [ "$EXIT" -ne 0 ]; then
    fail "AC-011 expected exit 0 (no spec → skip), got $EXIT; stdout: $OUT"
    return 1
  fi
  assert_contains "$OUT" "no spec; skipped" "AC-011 expected 'no spec; skipped' on stdout (got: $OUT)" || return 1
  local report="$root/.claude/state/drift/nonexistent-slug.md"
  if [ -f "$report" ]; then
    fail "AC-011 expected no report file when spec absent (found at $report)"
    return 1
  fi
}

# --- AC-002, OQ-4 -------------------------------------------------------------

test_when_drift_check_with_none_design_calls_then_section_renders_skipped() {
  local root; root="$(mktemp -d)"; trap "rm -rf $root" RETURN
  seed_project "$root" "wf-none-dc" "AC-001" "*(none)*"
  local diff_path="$root/diff.txt"
  seed_diff "$diff_path" "+def test_when_AC-001_then_ok(): pass
"
  OUT=""; EXIT=0
  run_drift "$root" "wf-none-dc" "$diff_path"
  if [ "$EXIT" -ne 0 ]; then
    fail "OQ-4 expected exit 0 (none design calls, AC resolved), got $EXIT; stdout: $OUT"
    return 1
  fi
  local report="$root/.claude/state/drift/wf-none-dc.md"
  assert_file_contains "$report" "no design calls" "OQ-4 expected 'no design calls — skipped' notice in report" || return 1
}

# --- runner -------------------------------------------------------------------

run test_when_drift_check_on_spec_with_all_resolved_then_exit_0
run test_when_drift_check_finds_unresolved_then_exit_1
run test_when_drift_check_no_spec_then_exit_0_skipped
run test_when_drift_check_with_none_design_calls_then_section_renders_skipped

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
