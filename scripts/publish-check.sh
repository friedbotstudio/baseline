#!/usr/bin/env bash
# publish-check.sh — orchestrates pre-publish verification for @friedbotstudio/create-baseline.
#
# Sequences three sub-checks:
#   1. precheck    — npm publish --dry-run (runs prepack; catches policy errors)
#   2. files-diff  — node scripts/check-files-diff.mjs (declared vs packed)
#   3. smoke       — node scripts/smoke-tarball.mjs   (install + exec the .tgz)
#
# Behavioral coverage lives at tests/publish-check.test.mjs (one unified suite
# covers all three publish-check scripts because they share invocation patterns
# and fixtures). Companion tests at tests/check-files-diff.test.mjs and
# tests/smoke-tarball.test.mjs assert sibling-script presence.
#
# PUBLISH_CHECK_SIMULATE_FAIL env var, when set to a step name, makes that step
# exit non-zero — used by tests to exercise the FAIL-summary path.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LAST_STEP=""
PASSED_STEPS=()

on_exit() {
  local code=$?
  if [ "$code" -eq 0 ]; then
    local list
    list="$(printf '%s, ' "${PASSED_STEPS[@]}")"
    list="${list%, }"
    echo "PASS: ${list} (${#PASSED_STEPS[@]} of 3)"
  else
    echo "FAIL: ${LAST_STEP:-unknown} (exit ${code})" >&2
  fi
}
trap on_exit EXIT

run_step() {
  local name="$1"
  shift
  LAST_STEP="$name"

  if [ "${PUBLISH_CHECK_SIMULATE_FAIL:-}" = "$name" ]; then
    echo "simulated fail: $name" >&2
    exit 99
  fi

  "$@" || exit $?
  PASSED_STEPS+=("$name")
}

precheck() {
  # Capture combined output so the PASS case stays quiet (npm publish --dry-run
  # is verbose) but a FAIL surfaces the actual diagnostic — without this the
  # caller sees only "FAIL: precheck (exit N)" with no postmortem context,
  # which is opaque on CI where there is no local reproduction.
  local out
  if ! out=$(cd "$REPO_ROOT" && npm publish --dry-run 2>&1); then
    printf '%s\n' "$out" >&2
    return 1
  fi
}

files_diff() {
  ( cd "$REPO_ROOT" && node "$SCRIPT_DIR/check-files-diff.mjs" )
}

smoke() {
  ( cd "$REPO_ROOT" && node "$SCRIPT_DIR/smoke-tarball.mjs" )
}

run_step precheck    precheck
run_step files-diff  files_diff
run_step smoke       smoke

exit 0
