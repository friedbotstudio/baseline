#!/usr/bin/env bash
set -euo pipefail

# Run what CI runs, against what CI sees.
#
# `npm test` on a developer tree is not the CI gate. `obj/template/` and
# `obj/site/` are gitignored build output that a fresh checkout does not have,
# and `.claude/state/**` is workflow state it does not have either. So the suite
# locally reads a warm tree — a render from an earlier build, state files a
# workflow left behind — while the same suite in CI reads a clean checkout plus
# two builds. A whole class of failure stays invisible until the push.
#
# It has bitten repeatedly. `fix(ci): make the test suite runnable in a clean
# checkout` and `fix(release): build the shipped template before the suite reads
# it` are both fixes for this gap, and CI found both, because nothing local
# could.
#
# The clone is what makes the run faithful: it checks out tracked files only, so
# no gitignored state can leak in and no amount of local mess changes the result.
# It is a clone rather than a `git worktree` because a linked worktree is not a
# primary work tree, and tests/git-workflow-model-detect.test.mjs asserts the repo
# root is one — the worktree version failed there for a reason unrelated to any
# change under test. CI checks out a primary tree, so this has to as well. The
# step sequence mirrors `.github/workflows/release.yml -> pre-publish-checks`,
# and tests/test-ci.test.mjs fails if the two drift.
#
# One thing it cannot cover, by construction: a phase that writes AFTER the
# suite runs. `/memory-sync` files memory entries two phases past `/integrate`,
# and a test pinned to a count derived from that store then breaks with nothing
# left to catch it. Run this after the last writing phase, not at integrate.

usage() {
  cat <<'USAGE'
usage: scripts/test-ci.sh [--keep] [--ref <git-ref>]

  --keep        leave the checkout on disk for inspection instead of removing it
  --ref <ref>   check out <ref> instead of HEAD

env:
  SKIP_AUDIT_SIGNATURES=1   skip `npm audit signatures` (needs network)
  SKIP_PUBLISH_CHECK=1      skip `npm run publish:check` (pack + install + smoke)

Both skips are named in the summary. A pass that skipped a step says which.
USAGE
}

KEEP=""
REF="HEAD"
# Default on, because the question this script answers is "will what I am about to
# push survive CI". Naming an explicit --ref asks about that commit as it stands,
# so the working tree stays out of it.
CARRY_OVER=1
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --ref) REF="${2:-}"; [ -n "$REF" ] || { usage >&2; exit 2; }; CARRY_OVER=""; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "test-ci: not a git repository — the clean-checkout guarantee needs one" >&2
  exit 2
fi

RESOLVED="$(git -C "$REPO_ROOT" rev-parse --short "$REF")"
CHECKOUT="${TMPDIR:-/tmp}/baseline-ci-$$"
SKIPPED=()
LAST_STEP=""

cleanup() {
  local code=$?
  if [ -n "$KEEP" ]; then
    echo "test-ci: checkout kept at $CHECKOUT"
  elif [ -n "${CHECKOUT:-}" ] && [ -d "$CHECKOUT" ]; then
    # Only the directory this run created, under the temp root, and only once
    # confirmed to be a directory. Never a path the caller supplied.
    rm -rf "$CHECKOUT"
  fi
  if [ "$code" -eq 0 ]; then
    if [ ${#SKIPPED[@]} -gt 0 ]; then
      echo "test-ci: PASS at $RESOLVED — SKIPPED: ${SKIPPED[*]}"
    else
      echo "test-ci: PASS at $RESOLVED — every CI step ran"
    fi
  else
    echo "test-ci: FAIL at ${LAST_STEP:-setup} (exit $code)" >&2
  fi
}
trap cleanup EXIT

step() {
  LAST_STEP="$1"
  shift
  echo "test-ci: $LAST_STEP"
  ( cd "$CHECKOUT" && "$@" )
}

git clone --quiet --no-checkout "$REPO_ROOT" "$CHECKOUT"
git -C "$CHECKOUT" checkout --quiet --detach "$RESOLVED"

# Carry the working tree over. The clone exists to leave gitignored leftovers
# behind, not to leave the change behind: a run against HEAD alone tells a
# developer nothing about what they are about to push. Both probes are the pair
# `assemble-context.mjs` settled on — tracked modifications from `diff HEAD`,
# created files from `ls-files --others`, where `--exclude-standard` is what
# keeps obj/ and .claude/state/ out.
if [ -n "$CARRY_OVER" ]; then
  LAST_STEP="carry over working tree"
  echo "test-ci: $LAST_STEP"

  if ! git -C "$REPO_ROOT" diff --quiet HEAD; then
    git -C "$REPO_ROOT" diff HEAD | git -C "$CHECKOUT" apply --whitespace=nowarn -
  fi

  CREATED=0
  while IFS= read -r -d '' path; do
    mkdir -p "$CHECKOUT/$(dirname "$path")"
    cp -p "$REPO_ROOT/$path" "$CHECKOUT/$path"
    CREATED=$((CREATED + 1))
  done < <(git -C "$REPO_ROOT" ls-files --others --exclude-standard -z)

  echo "test-ci: carried over $CREATED created file(s) plus tracked modifications"
fi

step "npm ci" npm ci --no-fund

if [ "${SKIP_AUDIT_SIGNATURES:-}" = "1" ]; then
  SKIPPED+=("npm audit signatures")
else
  step "npm audit signatures" npm audit signatures
fi

step "npm run build" npm run build
step "npm run build:site" npm run build:site
step "npm test" npm test

if [ "${SKIP_PUBLISH_CHECK:-}" = "1" ]; then
  SKIPPED+=("npm run publish:check")
else
  step "npm run publish:check" npm run publish:check
fi
