#!/usr/bin/env bash
# Fixture-based integration tests for the changelog skill's golden-path
# behavior. Covers AC-001, AC-002, AC-008 from
# docs/specs/changelog-skill-and-responsive-svgs.md.
#
# Until .claude/skills/changelog/changelog.mjs exists, every test fails RED
# (correct TDD state).

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
ACTUATOR="$REPO_ROOT/.claude/skills/changelog/changelog.mjs"

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

today() { date -u +%Y-%m-%d; }

# Build a tempdir project with .git, one feat: commit, fresh commit_consent,
# and workflow.json with phases up through memory-flush completed.
seed_golden_path_project() {
  local proj="$1" slug="$2"
  mkdir -p "$proj/.claude/state"
  cd "$proj"
  git init -q >/dev/null 2>&1
  git config user.email "test@example.com"
  git config user.name "Test"
  # Seed an existing-tracked CHANGELOG.md BEFORE the feat commit so that when
  # the actuator appends to it, git status reports M (modified) rather than ??
  # (untracked). This matches the realistic workflow shape: any real project
  # has a tracked CHANGELOG.md, the actuator modifies it, /commit stages the
  # modification.
  cat > "$proj/CHANGELOG.md" <<'EOF'
# Changelog

## [Unreleased]

## [0.1.0] - 2026-01-01

### Added
- Initial release
EOF
  git add CHANGELOG.md
  git commit -q -m "chore: initial"
  git tag v0.1.0
  echo "added thing" > thing.txt
  git add thing.txt
  git commit -q -m "feat(skill): add the thing"
  # Fresh commit_consent (epoch now).
  date +%s > "$proj/.claude/state/commit_consent"
  echo "test consent" >> "$proj/.claude/state/commit_consent"
  # workflow.json with all phases up through memory-flush completed.
  cat > "$proj/.claude/state/workflow.json" <<EOF
{
  "request": "golden-path test",
  "slug": "$slug",
  "entry_phase": "intake",
  "exceptions": [],
  "completed": ["intake","scout","research","spec","approve-spec","tdd","simplify","security","integrate","document","archive","memory-flush"],
  "source_backlog_keys": [],
  "created_at": 1700000000,
  "updated_at": 1700000000
}
EOF
  # Minimal .releaserc.json so semantic-release can analyze.
  cat > "$proj/.releaserc.json" <<'EOF'
{
  "branches": ["main"],
  "plugins": [
    ["@semantic-release/commit-analyzer", { "preset": "angular" }]
  ]
}
EOF
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

# --- AC-001 -------------------------------------------------------------------

test_when_grant_commit_token_fresh_then_changelog_writes_unreleased_section() {
  local proj; proj="$(mktemp -d)"; trap "rm -rf $proj" RETURN
  seed_golden_path_project "$proj" "golden-path"
  if [ ! -f "$ACTUATOR" ]; then
    fail "AC-001 actuator not yet at $ACTUATOR — expected pre-implement RED state"
    return 1
  fi
  node "$ACTUATOR" --slug golden-path --project-root "$proj" \
    > /tmp/changelog-stdout.$$ 2> /tmp/changelog-stderr.$$ \
    || { fail "AC-001 actuator exited non-zero; stderr: $(cat /tmp/changelog-stderr.$$)"; return 1; }
  assert_file_contains "$proj/CHANGELOG.md" "## [Unreleased]" "AC-001 Unreleased heading missing" || return 1
  # At least one keepachangelog category subheading under Unreleased.
  assert_file_matches "$proj/CHANGELOG.md" '^### (Added|Changed|Deprecated|Removed|Fixed|Security)' \
    "AC-001 no keepachangelog category subheading in CHANGELOG.md" || return 1
  # State file written.
  [ -f "$proj/.claude/state/changelog/golden-path.json" ] \
    || { fail "AC-001 .claude/state/changelog/golden-path.json not written"; return 1; }
  # State file is valid JSON with expected shape.
  python3 -c "
import json, sys
with open('$proj/.claude/state/changelog/golden-path.json') as f:
    data = json.load(f)
required = {'slug', 'source_commit_sha', 'entries', 'generated_at'}
missing = required - set(data.keys())
if missing:
    sys.exit(f'state file missing keys: {missing}')
if data['slug'] != 'golden-path':
    sys.exit(f'slug mismatch: {data[\"slug\"]}')
if not isinstance(data['entries'], list):
    sys.exit('entries must be a list')
" || { fail "AC-001 state file shape invalid"; return 1; }
}

# --- AC-002 -------------------------------------------------------------------

test_when_changelog_completed_then_commit_includes_changelog_md_in_stage_list() {
  local proj; proj="$(mktemp -d)"; trap "rm -rf $proj" RETURN
  seed_golden_path_project "$proj" "stage-list"
  if [ ! -f "$ACTUATOR" ]; then
    fail "AC-002 actuator not yet at $ACTUATOR — expected pre-implement RED state"
    return 1
  fi
  cd "$proj"
  node "$ACTUATOR" --slug stage-list --project-root "$proj" >/dev/null 2>&1 \
    || { fail "AC-002 actuator exited non-zero"; return 1; }
  # CHANGELOG.md must now be modified in the working tree (the change the skill made).
  local diff_status; diff_status="$(cd "$proj" && git status --porcelain CHANGELOG.md)"
  if [ -z "$diff_status" ]; then
    fail "AC-002 CHANGELOG.md must show modification in git status after changelog skill runs"
    return 1
  fi
  # Confirm M flag (modified) on the file.
  printf '%s' "$diff_status" | grep -qE '^\s*M\s+CHANGELOG\.md' \
    || { fail "AC-002 CHANGELOG.md not marked Modified in git status; got: $diff_status"; return 1; }
}

# --- AC-008 -------------------------------------------------------------------

test_when_workflow_completed_then_changelog_appended_before_commit() {
  # Static: the commit SKILL.md prereq line names "changelog" as a required
  # entry in workflow.json → completed. The harness ordering text lists
  # changelog immediately before commit. This test reads the LIVE SKILL.md
  # files (which the implement worker edits) and asserts on their content.
  local commit_skill="$REPO_ROOT/.claude/skills/commit/SKILL.md"
  local harness_skill="$REPO_ROOT/.claude/skills/harness/SKILL.md"
  [ -f "$commit_skill" ] || { fail "AC-008 commit/SKILL.md missing"; return 1; }
  [ -f "$harness_skill" ] || { fail "AC-008 harness/SKILL.md missing"; return 1; }
  # commit SKILL.md prereq line must mention changelog.
  assert_file_matches "$commit_skill" 'archive.*memory-flush.*changelog|changelog.*archive.*memory-flush|memory-flush.*changelog' \
    "AC-008 commit/SKILL.md prereq must include changelog alongside archive and memory-flush" \
    || return 1
  # harness ordering text mentions changelog between grant-commit and commit.
  assert_file_matches "$harness_skill" '/grant-commit.*changelog.*commit|grant-commit → changelog → commit' \
    "AC-008 harness/SKILL.md ordering must mention changelog between /grant-commit and commit" \
    || return 1
}

# --- runner -------------------------------------------------------------------

run test_when_grant_commit_token_fresh_then_changelog_writes_unreleased_section
run test_when_changelog_completed_then_commit_includes_changelog_md_in_stage_list
run test_when_workflow_completed_then_changelog_appended_before_commit

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
