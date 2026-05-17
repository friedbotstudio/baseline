#!/usr/bin/env bash
# Fixture-based integration test for AC-010: when commit_consent token is
# stale (older than consent.commit_ttl_seconds, default 300s), the changelog
# skill exits non-zero with "consent expired" stderr, does NOT modify
# CHANGELOG.md, and does NOT write the state file.
#
# Pre-implement RED state: actuator does not exist; test fails on missing file.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
ACTUATOR="$REPO_ROOT/.claude/skills/changelog/changelog.mjs"

PASS=0; FAIL=0; FAILED=()

fail() { echo "  FAIL: $*"; return 1; }

# Seed a tempdir with a stale commit_consent (epoch = now - 310s).
seed_stale_consent_project() {
  local proj="$1" slug="$2"
  mkdir -p "$proj/.claude/state"
  cd "$proj"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty -q -m "chore: initial"
  git tag v0.1.0
  echo "stale test" > thing.txt
  git add thing.txt
  git commit -q -m "feat: stale consent path"
  # Stale token: epoch in the past, beyond 300s default TTL.
  local stale_epoch; stale_epoch=$(( $(date +%s) - 310 ))
  echo "$stale_epoch" > "$proj/.claude/state/commit_consent"
  echo "stale" >> "$proj/.claude/state/commit_consent"
  cat > "$proj/.claude/state/workflow.json" <<EOF
{
  "request": "consent-expired test",
  "slug": "$slug",
  "entry_phase": "intake",
  "exceptions": [],
  "completed": ["intake","scout","research","spec","approve-spec","tdd","simplify","security","integrate","document","archive","memory-flush"],
  "source_backlog_keys": [],
  "created_at": 1700000000,
  "updated_at": 1700000000
}
EOF
  cat > "$proj/CHANGELOG.md" <<'EOF'
# Changelog

## [0.1.0] - 2026-01-01

### Added
- Initial release
EOF
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

# --- AC-010 -------------------------------------------------------------------

test_when_commit_consent_token_stale_then_changelog_exits_with_consent_expired() {
  local proj; proj="$(mktemp -d)"; trap "rm -rf $proj" RETURN
  seed_stale_consent_project "$proj" "stale-consent"
  if [ ! -f "$ACTUATOR" ]; then
    fail "AC-010 actuator not yet at $ACTUATOR — expected pre-implement RED state"
    return 1
  fi
  local changelog_before; changelog_before="$(sha256sum "$proj/CHANGELOG.md" | awk '{print $1}')"
  local out; local err
  # Capture stdout, stderr, and exit code. NO `|| true` after the assignment —
  # set -uo pipefail is active (no `-e`), so a non-zero exit from the assigned
  # command propagates to $? without aborting the test. Adding `|| true` here
  # would clobber $? to 0 and silently break the exit-code assertion below.
  out="$(node "$ACTUATOR" --slug stale-consent --project-root "$proj" 2>/tmp/changelog-stderr.$$)"
  local ec=$?
  err="$(cat /tmp/changelog-stderr.$$)"
  if [ "$ec" -eq 0 ]; then
    fail "AC-010 actuator must exit non-zero on stale consent; exit was 0"
    return 1
  fi
  # stderr must mention "consent expired" (case-insensitive match).
  if ! printf '%s' "$err" | grep -qiE 'consent.*expired|expired.*consent'; then
    fail "AC-010 stderr must match /consent.*expired/i; got: $err"
    return 1
  fi
  # CHANGELOG.md unchanged.
  local changelog_after; changelog_after="$(sha256sum "$proj/CHANGELOG.md" | awk '{print $1}')"
  if [ "$changelog_before" != "$changelog_after" ]; then
    fail "AC-010 CHANGELOG.md was modified despite stale consent"
    return 1
  fi
  # State file NOT created.
  if [ -f "$proj/.claude/state/changelog/stale-consent.json" ]; then
    fail "AC-010 state file must NOT be written on stale consent"
    return 1
  fi
}

# --- runner -------------------------------------------------------------------

run test_when_commit_consent_token_stale_then_changelog_exits_with_consent_expired

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
