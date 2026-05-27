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

block="$(CLAUDE_PROJECT_DIR="$REPO_ROOT" $HOOK_RUNNER "$HOOK" <<< '{}' | node --input-type=module -e '
import { readFileSync } from "node:fs";
const HEAD_RE = /^(HEAD:\s*`)[^`]+(`)/;
const data = readFileSync(0, "utf8").trim();
if (!data) {
  process.stderr.write("regenerate-ac008.sh: memory_session_start hook emitted no output\n");
  process.exit(1);
}
const j = JSON.parse(data);
const ctx = j.hookSpecificOutput.additionalContext;
const out = [];
let started = false;
for (const ln of ctx.split("\n")) {
  if (ln.startsWith("## Project memory")) started = true;
  if (!started) continue;
  out.push(ln.replace(HEAD_RE, "$1n/a$2"));
  if (ln.startsWith("| `pending-questions.md`")) break;
}
process.stdout.write(out.join("\n") + "\n");
')"

printf '%s\n' "$block" > "$FIXTURE"
echo "regenerated $FIXTURE"
