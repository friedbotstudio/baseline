#!/usr/bin/env bash
# Fixture-based integration test for AC-012: the changelog actuator's
# --preview-only mode prints projected next semver + draft fragment to stdout,
# requires no commit_consent gesture, and writes no files.
#
# Pre-implement RED: actuator does not exist; test fails on missing file.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
ACTUATOR="$REPO_ROOT/.claude/skills/changelog/changelog.mjs"

PASS=0; FAIL=0; FAILED=()

fail() { echo "  FAIL: $*"; return 1; }

# Build a tempdir project WITHOUT commit_consent (preview must work without it).
seed_preview_project() {
  local proj="$1"
  mkdir -p "$proj/.claude/state"
  cd "$proj"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty -q -m "chore: initial"
  git tag v0.1.0
  echo "preview" > thing.txt
  git add thing.txt
  git commit -q -m "feat: preview path"
  # NO commit_consent file.
  # NO workflow.json — preview must not require one.
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

# --- AC-012 -------------------------------------------------------------------

test_when_preview_only_flag_then_stdout_projection_no_writes() {
  local proj; proj="$(mktemp -d)"; trap "rm -rf $proj" RETURN
  seed_preview_project "$proj"
  if [ ! -f "$ACTUATOR" ]; then
    fail "AC-012 actuator not yet at $ACTUATOR — expected pre-implement RED state"
    return 1
  fi
  local out
  out="$(node "$ACTUATOR" --preview-only --slug demo --project-root "$proj" 2>/tmp/preview-stderr.$$)"
  local ec=$?
  if [ "$ec" -ne 0 ]; then
    fail "AC-012 preview-only must exit 0; got $ec; stderr: $(cat /tmp/preview-stderr.$$)"
    return 1
  fi
  # stdout matches Projected: <semver>.
  if ! printf '%s' "$out" | grep -qE 'Projected:\s*[0-9]+\.[0-9]+\.[0-9]+'; then
    fail "AC-012 stdout must contain Projected: <semver>; got: $out"
    return 1
  fi
  # No state file written.
  if [ -f "$proj/.claude/state/changelog/demo.json" ]; then
    fail "AC-012 preview-only must NOT write state file"
    return 1
  fi
  # CHANGELOG.md is either absent (we never created one) or unchanged.
  if [ -f "$proj/CHANGELOG.md" ]; then
    fail "AC-012 preview-only must NOT create CHANGELOG.md when absent"
    return 1
  fi
}

# --- runner -------------------------------------------------------------------

run test_when_preview_only_flag_then_stdout_projection_no_writes

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
