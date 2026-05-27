#!/usr/bin/env bash
# Fixture-based integration tests for the audit-baseline preamble validator.
# Covers the strict-preamble tightening in .claude/skills/audit-baseline/audit.mjs.
#
# Each test builds a synthetic .claude/memory/ tree under a tempdir (with all
# 9 expected canonical filenames), substitutes one file with a fixture, then
# runs audit.mjs with CLAUDE_PROJECT_DIR pointed at the tempdir and greps the
# captured output for the "memory shape: <name>.md" line.
#
# The audit will exit non-zero in the stub tree because hook/skill/agent
# counts won't match — that's expected. We only assert on the specific
# memory-shape line each test cares about.
#
# Not wired into project.json -> test.cmd; run manually during /tdd and
# /integrate alongside .claude/hooks/tests/memory_session_start_test.sh.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
AUDIT="$REPO_ROOT/.claude/skills/audit-baseline/audit.mjs"
FIXTURES="$HERE/fixtures"

PASS=0; FAIL=0; FAILED=()

# --- assertion helpers --------------------------------------------------------

fail() { echo "  FAIL: $*"; return 1; }

# Seed a stub .claude/memory/ tree under $1. The file basename $2 is replaced
# with the fixture content from $3; the other 8 expected files get a valid
# synthetic preamble so they don't pollute the audit output we grep against.
seed_stub_tree() {
  local root="$1" under_test="$2" fixture_path="$3"
  mkdir -p "$root/.claude/memory"
  # README is checked separately by audit.mjs; copy the real one so that check
  # passes and doesn't tangle our grep.
  cp "$REPO_ROOT/.claude/memory/README.md" "$root/.claude/memory/README.md"
  local mem_name
  for mem_name in landmarks libraries decisions landmines conventions \
                  pending-questions backlog _pending _resume; do
    if [ "$mem_name" = "$under_test" ]; then
      cp "$fixture_path" "$root/.claude/memory/${mem_name}.md"
    else
      cat > "$root/.claude/memory/${mem_name}.md" <<'EOF'
---
owners: [test]
key: test
---

# Synthetic valid preamble
EOF
    fi
  done
}

# Run audit.mjs against the stub tree at $1 and print the line matching
# "memory shape: $2.md" to stdout. Returns 1 if no such line found.
audit_memory_shape_line() {
  local root="$1" name="$2"
  CLAUDE_PROJECT_DIR="$root" node "$AUDIT" 2>&1 \
    | grep -E "^memory shape: ${name}\.md[[:space:]]" \
    | head -1
}

# Assert that the memory-shape line for $2 in the audit run against $1 has
# status $3 and a detail matching the extended-regex $4.
assert_memory_shape() {
  local root="$1" name="$2" want_status="$3" want_detail_re="$4"
  local line; line="$(audit_memory_shape_line "$root" "$name")"
  if [ -z "$line" ]; then
    fail "no 'memory shape: ${name}.md' line in audit output"
    return 1
  fi
  if ! printf '%s' "$line" | grep -qE "[[:space:]]${want_status}[[:space:]]"; then
    fail "expected status ${want_status} for ${name}.md; got: ${line}"
    return 1
  fi
  if ! printf '%s' "$line" | grep -qE "${want_detail_re}"; then
    fail "expected detail matching '${want_detail_re}' for ${name}.md; got: ${line}"
    return 1
  fi
  return 0
}

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

test_when_memory_file_has_opener_only_then_audit_reports_fail() {
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf $tmp" RETURN
  seed_stub_tree "$tmp" "landmarks" "$FIXTURES/preamble_opener_only.md"
  assert_memory_shape "$tmp" "landmarks" "FAIL" \
    "malformed frontmatter: missing closing separator"
}

test_when_memory_file_has_no_opener_then_audit_reports_fail() {
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf $tmp" RETURN
  seed_stub_tree "$tmp" "libraries" "$FIXTURES/preamble_no_opener.md"
  assert_memory_shape "$tmp" "libraries" "FAIL" \
    "missing frontmatter"
}

test_when_memory_file_has_valid_full_preamble_no_body_then_audit_reports_pass_preamble_only() {
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf $tmp" RETURN
  seed_stub_tree "$tmp" "decisions" "$FIXTURES/preamble_full_empty_body.md"
  assert_memory_shape "$tmp" "decisions" "PASS" \
    "empty \\(preamble-only\\)"
}

test_when_memory_file_has_valid_preamble_with_entries_then_audit_reports_pass_with_count() {
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf $tmp" RETURN
  seed_stub_tree "$tmp" "landmines" "$FIXTURES/preamble_full_with_entries.md"
  assert_memory_shape "$tmp" "landmines" "PASS" \
    "1 entries"
}

test_when_pending_file_has_opener_only_then_audit_reports_fail() {
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf $tmp" RETURN
  seed_stub_tree "$tmp" "_pending" "$FIXTURES/_pending_opener_only.md"
  assert_memory_shape "$tmp" "_pending" "FAIL" \
    "malformed frontmatter: missing closing separator"
}

# --- runner -------------------------------------------------------------------

run test_when_memory_file_has_opener_only_then_audit_reports_fail
run test_when_memory_file_has_no_opener_then_audit_reports_fail
run test_when_memory_file_has_valid_full_preamble_no_body_then_audit_reports_pass_preamble_only
run test_when_memory_file_has_valid_preamble_with_entries_then_audit_reports_pass_with_count
run test_when_pending_file_has_opener_only_then_audit_reports_fail

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
