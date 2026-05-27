#!/usr/bin/env bash
# Regenerate the AC-008 byte-equality fixture from the live .claude/memory/ tree.
#
# Runs memory_session_start.sh against the current repo, extracts the
# "## Project memory" header through the "| `pending-questions.md`" row, and
# normalizes the HEAD short SHA to the literal sentinel "n/a". The fixture is
# HEAD-agnostic; memory_session_start_test.sh's AC-008 case applies the same
# normalization to the live capture before byte-comparing.
#
# Re-run this whenever the canonical .claude/memory/ tree drifts in entry
# counts. Idempotent — same tree state produces identical bytes.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
HOOK="$REPO_ROOT/.claude/hooks/memory_session_start.mjs"
HOOK_RUNNER="node"
FIXTURE="$HERE/ac008_byte_equal_reference.txt"

if [ ! -f "$HOOK" ]; then
  echo "regenerate-ac008.sh: hook not found at $HOOK" >&2
  exit 1
fi

block="$(CLAUDE_PROJECT_DIR="$REPO_ROOT" $HOOK_RUNNER "$HOOK" <<< '{}' | python3 -c '
import json, re, sys
HEAD_RE = re.compile(r"^(HEAD:\s*`)[^`]+(`)")
data = sys.stdin.read().strip()
if not data:
    sys.exit("regenerate-ac008.sh: memory_session_start.sh emitted no output")
j = json.loads(data)
ctx = j["hookSpecificOutput"]["additionalContext"]
out = []
started = False
for ln in ctx.split("\n"):
    if ln.startswith("## Project memory"):
        started = True
    if not started:
        continue
    out.append(HEAD_RE.sub(r"\1n/a\2", ln))
    if ln.startswith("| `pending-questions.md`"):
        break
sys.stdout.write("\n".join(out) + "\n")
')"

printf '%s\n' "$block" > "$FIXTURE"
echo "regenerated $FIXTURE"
