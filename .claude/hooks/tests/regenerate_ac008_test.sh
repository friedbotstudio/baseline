#!/usr/bin/env bash
# Integration test for the regenerate-ac008.sh helper.
# Covers AC-001 from docs/specs/workflow-loop-closing-hygiene.md.
#
# Contract: bash .claude/hooks/tests/fixtures/regenerate-ac008.sh overwrites
# .claude/hooks/tests/fixtures/ac008_byte_equal_reference.txt with the live
# memory_session_start.sh output (header + table block through pending-questions.md),
# with HEAD normalized to the `n/a` sentinel. After regen, the AC-008 byte-equality
# test inside memory_session_start_test.sh exits PASS.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
HELPER="$REPO_ROOT/.claude/hooks/tests/fixtures/regenerate-ac008.sh"
FIXTURE="$REPO_ROOT/.claude/hooks/tests/fixtures/ac008_byte_equal_reference.txt"
TEST_RUNNER="$REPO_ROOT/.claude/hooks/tests/memory_session_start_test.sh"

PASS=0; FAIL=0; FAILED=()

fail() { echo "  FAIL: $*"; return 1; }

run() {
  local name="$1"
  echo "RUN  $name"
  if "$name"; then
    PASS=$((PASS+1)); echo "PASS $name"
  else
    FAIL=$((FAIL+1)); FAILED+=("$name"); echo "FAIL $name"
  fi
}

# --- tests --------------------------------------------------------------------

test_when_regenerate_ac008_runs_then_existing_ac008_test_passes() {
  if [ ! -f "$HELPER" ]; then
    fail "AC-001 helper not found at $HELPER"
    return 1
  fi
  if [ ! -x "$HELPER" ] && ! head -1 "$HELPER" | grep -q '^#!'; then
    fail "AC-001 helper $HELPER is not executable and has no shebang"
    return 1
  fi
  # Stash the existing fixture so we can restore it if the test fails mid-flow.
  local stash; stash="$(mktemp)"
  cp "$FIXTURE" "$stash" 2>/dev/null || true
  # Run the regenerator; the fixture is overwritten with normalized capture.
  ( cd "$REPO_ROOT" && bash "$HELPER" ) >/dev/null 2>&1 \
    || { fail "AC-001 regenerate helper exited non-zero"; cp "$stash" "$FIXTURE" 2>/dev/null; rm -f "$stash"; return 1; }
  # The AC-008 byte-equal test must now pass against the freshly regenerated fixture.
  ( cd "$REPO_ROOT" && bash "$TEST_RUNNER" >/dev/null 2>&1 ) \
    || { fail "AC-001 memory_session_start_test.sh exited non-zero after regen"; cp "$stash" "$FIXTURE" 2>/dev/null; rm -f "$stash"; return 1; }
  rm -f "$stash"
  return 0
}

test_when_regenerate_ac008_runs_twice_then_fixture_is_byte_identical() {
  if [ ! -f "$HELPER" ]; then
    fail "AC-001 helper not found at $HELPER"
    return 1
  fi
  local first second
  ( cd "$REPO_ROOT" && bash "$HELPER" ) >/dev/null 2>&1 \
    || { fail "AC-001 first regen exited non-zero"; return 1; }
  first="$(sha256sum "$FIXTURE" 2>/dev/null | awk '{print $1}')"
  ( cd "$REPO_ROOT" && bash "$HELPER" ) >/dev/null 2>&1 \
    || { fail "AC-001 second regen exited non-zero"; return 1; }
  second="$(sha256sum "$FIXTURE" 2>/dev/null | awk '{print $1}')"
  if [ "$first" = "$second" ]; then return 0; fi
  fail "AC-001 fixture not byte-identical across two regens ($first vs $second)"
  return 1
}

test_when_regenerate_ac008_runs_then_fixture_head_line_is_n_a_sentinel() {
  if [ ! -f "$HELPER" ]; then
    fail "AC-001 helper not found at $HELPER"
    return 1
  fi
  ( cd "$REPO_ROOT" && bash "$HELPER" ) >/dev/null 2>&1 \
    || { fail "AC-001 regen exited non-zero"; return 1; }
  if grep -qE '^HEAD: `n/a`' "$FIXTURE"; then return 0; fi
  fail "AC-001 fixture HEAD line is not the n/a sentinel"
  grep -E '^HEAD:' "$FIXTURE" || true
  return 1
}

# --- runner -------------------------------------------------------------------

run test_when_regenerate_ac008_runs_then_existing_ac008_test_passes
run test_when_regenerate_ac008_runs_twice_then_fixture_is_byte_identical
run test_when_regenerate_ac008_runs_then_fixture_head_line_is_n_a_sentinel

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
