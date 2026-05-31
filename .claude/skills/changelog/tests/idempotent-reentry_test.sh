#!/usr/bin/env bash
# Regression test for the idempotency invariant: invoking the changelog
# actuator twice on the same slug + same commit SHA SHALL NOT duplicate
# entries under ## [Unreleased]; the state file mtime advances but content
# (excluding generated_at) is byte-equal.
#
# Pre-implement RED: actuator does not exist; test fails on missing file.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
ACTUATOR="$REPO_ROOT/.claude/skills/changelog/changelog.mjs"

PASS=0; FAIL=0; FAILED=()

fail() { echo "  FAIL: $*"; return 1; }

# Identical setup to golden-path_test.sh; replicated here so each test file
# stays independently runnable.
seed_idem_project() {
  local proj="$1" slug="$2"
  mkdir -p "$proj/.claude/state"
  cd "$proj"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty -q -m "chore: initial"
  git tag v0.1.0
  echo "thing" > thing.txt
  git add thing.txt
  git commit -q -m "feat: add the thing"
  date +%s > "$proj/.claude/state/commit_consent"
  echo "fresh" >> "$proj/.claude/state/commit_consent"
  # Caller-supplied entries (WF-4b). Idempotency holds because appendUnderUnreleased
  # REPLACES the [Unreleased] body with these entries — same entries, same result.
  cat > "$proj/entries.json" <<'EOF'
[{"section":"Added","body":"add the thing","breaking":false}]
EOF
  cat > "$proj/.claude/state/workflow.json" <<EOF
{
  "request": "idempotent re-entry test",
  "slug": "$slug",
  "track_id": "intake-full",
  "skipped_alternates": [],
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

# --- regression: idempotency -------------------------------------------------

test_when_invoked_twice_then_no_duplicate_unreleased_entries() {
  local proj; proj="$(mktemp -d)"; trap "rm -rf $proj" RETURN
  seed_idem_project "$proj" "idem-test"
  if [ ! -f "$ACTUATOR" ]; then
    fail "actuator not yet at $ACTUATOR — expected pre-implement RED state"
    return 1
  fi
  # First invocation.
  node "$ACTUATOR" --slug idem-test --project-root "$proj" --entries-file "$proj/entries.json" >/dev/null 2>&1 \
    || { fail "first invocation exited non-zero"; return 1; }
  local hash1; hash1="$(sha256sum "$proj/CHANGELOG.md" | awk '{print $1}')"
  local state1; state1="$(cat "$proj/.claude/state/changelog/idem-test.json")"
  # Sleep 1s so generated_at advances detectably.
  sleep 1
  # Second invocation (same slug, same git HEAD, same entries).
  node "$ACTUATOR" --slug idem-test --project-root "$proj" --entries-file "$proj/entries.json" >/dev/null 2>&1 \
    || { fail "second invocation exited non-zero"; return 1; }
  local hash2; hash2="$(sha256sum "$proj/CHANGELOG.md" | awk '{print $1}')"
  if [ "$hash1" != "$hash2" ]; then
    fail "CHANGELOG.md changed on re-entry; hash1=$hash1 hash2=$hash2"
    return 1
  fi
  # State file: contents excluding generated_at and unreleased_inserted_at MUST be byte-equal.
  NEW_STATE_PATH="$proj/.claude/state/changelog/idem-test.json" OLD_STATE_JSON="$state1" node --input-type=module -e '
import { readFileSync } from "node:fs";
const newObj = JSON.parse(readFileSync(process.env.NEW_STATE_PATH, "utf8"));
const oldObj = JSON.parse(process.env.OLD_STATE_JSON);
for (const k of ["generated_at", "unreleased_inserted_at"]) { delete newObj[k]; delete oldObj[k]; }
const sortStringify = (o) => JSON.stringify(o, Object.keys(o).sort());
if (sortStringify(newObj) !== sortStringify(oldObj)) {
  process.stderr.write(`state diverged: new=${JSON.stringify(newObj)} old=${JSON.stringify(oldObj)}\n`);
  process.exit(1);
}
' || { fail "state file content drifted on re-entry"; return 1; }
}

# --- runner -------------------------------------------------------------------

run test_when_invoked_twice_then_no_duplicate_unreleased_entries

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
