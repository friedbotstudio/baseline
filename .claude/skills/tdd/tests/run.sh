#!/usr/bin/env bash
# Aggregate test runner for .claude/skills/tdd/.
# Invokes each sibling *_test.sh and exits non-zero if any fail.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
FAIL=0

for t in "$HERE"/*_test.sh; do
  [ -f "$t" ] || continue
  echo "=== $(basename "$t") ==="
  bash "$t" || FAIL=$((FAIL+1))
done

if [ "$FAIL" -gt 0 ]; then
  echo "tdd/tests: $FAIL suite(s) failed"
  exit 1
fi
echo "tdd/tests: all suites passed"
exit 0
