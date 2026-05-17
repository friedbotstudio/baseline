#!/usr/bin/env bash
# Fixture-based test for AC-003: when a project is not a git repository,
# /triage SHALL auto-except changelog alongside commit and the swarm-* phases,
# AND no Run /changelog task SHALL be seeded.
#
# Static-analysis test: reads the LIVE .claude/skills/triage/SKILL.md content
# (which the implement worker edits) and asserts on its content. Until the
# implement worker updates triage SKILL.md, this test fails RED.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
TRIAGE_SKILL="$REPO_ROOT/.claude/skills/triage/SKILL.md"

PASS=0; FAIL=0; FAILED=()

fail() { echo "  FAIL: $*"; return 1; }

assert_file_contains() {
  local path="$1" needle="$2" msg="$3"
  if grep -qF "$needle" "$path" 2>/dev/null; then return 0; fi
  fail "$msg :: file $path missing: $needle"
}

assert_file_matches() {
  local path="$1" pattern="$2" msg="$3"
  if grep -qE "$pattern" "$path" 2>/dev/null; then return 0; fi
  fail "$msg :: file $path missing pattern: $pattern"
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

# --- AC-003 — static-analysis on triage SKILL.md -----------------------------

test_when_triage_skill_md_describes_nongit_then_changelog_in_exceptions_list() {
  [ -f "$TRIAGE_SKILL" ] || { fail "AC-003 triage/SKILL.md missing"; return 1; }
  # The non-git auto-except list MUST mention 'changelog' alongside the
  # existing 'swarm-plan', 'approve-swarm', 'swarm-dispatch', 'grant-commit',
  # 'commit' entries. The exact phrasing may vary; assert presence of the
  # changelog token within reasonable proximity of the other tokens.
  if ! grep -qE '"swarm-plan".*"swarm-dispatch".*"commit"' "$TRIAGE_SKILL"; then
    fail "AC-003 baseline non-git auto-except list not found in triage SKILL.md"
    return 1
  fi
  assert_file_contains "$TRIAGE_SKILL" '"changelog"' \
    "AC-003 triage SKILL.md non-git auto-except list must include \"changelog\"" \
    || return 1
}

test_when_triage_task_templates_include_changelog_row_between_grant_commit_and_commit() {
  [ -f "$TRIAGE_SKILL" ] || { fail "AC-003 triage/SKILL.md missing"; return 1; }
  # Each non-chore template (tdd-entry, spec-entry, intake-entry) AND the
  # chore template SHOULD include a Run /changelog task row between
  # "Wait for /grant-commit" and "Run /commit". The exact prose varies but the
  # ordering must hold.
  # Strategy: extract the prose between "Wait for /grant-commit" and "Run /commit"
  # blocks and require "changelog" to appear within that slice.
  if ! python3 - "$TRIAGE_SKILL" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path).read()
# Find every occurrence of "Wait for /grant-commit" followed by content up to "Run /commit"
matches = list(re.finditer(
    r'Wait for /grant-commit[\s\S]*?Run /commit', text))
if not matches:
    sys.exit('no "Wait for /grant-commit" → "Run /commit" sequence found in triage SKILL.md')
# Every such slice must mention "changelog".
missing = [i for i, m in enumerate(matches) if 'changelog' not in m.group(0).lower()]
if missing:
    sys.exit(f'{len(missing)} task-seeding slice(s) missing changelog: indices {missing}')
PY
  then
    fail "AC-003 triage SKILL.md task-seeding templates must include changelog between grant-commit and commit"
    return 1
  fi
}

# --- runner -------------------------------------------------------------------

run test_when_triage_skill_md_describes_nongit_then_changelog_in_exceptions_list
run test_when_triage_task_templates_include_changelog_row_between_grant_commit_and_commit

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
