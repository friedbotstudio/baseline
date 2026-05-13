#!/usr/bin/env bash
# Verify Pass Guard — PreToolUse(Write|Edit|MultiEdit)
#
# Belt-and-braces backstop for the `verify` skill. Operates at the Write tool
# boundary: even if the skill's verdict is bypassed, Claude physically cannot
# persist a "PASS" line to a verification artifact when the most recent test
# output contradicts it.
#
# Triggers only when the target file is a verification artifact (paths under
# docs/verify/** or filename matches *verify* / *verification*), and the
# content being written contains a PASS line (VERIFY: PASS, STATUS: PASS,
# RESULT: PASS, or a line that is just "PASS").
#
# Truth source: .claude/state/last_test_result (written by test_runner.sh
# and the `verify` skill). Contains one line: PASS|FAIL.

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

TOOL="$(payload_get .tool_name)"
case "$TOOL" in
  Write|Edit|MultiEdit) ;;
  *) emit_allow ;;
esac

FILE="$(payload_get .tool_input.file_path)"
[ -n "$FILE" ] || emit_allow
rel="${FILE#$CLAUDE_PROJECT_ROOT/}"

# Is this a verification artifact?
is_verify=0
case "$rel" in
  docs/verify/*|docs/verification/*) is_verify=1 ;;
esac
base="$(basename "$rel")"
case "$base" in
  *verify*|*verification*|*VERIFY*) is_verify=1 ;;
esac
[ "$is_verify" -eq 1 ] || emit_allow

# Collect proposed content: Write.content, Edit.new_string, MultiEdit.edits[].new_string.
content=""
case "$TOOL" in
  Write) content="$(payload_get .tool_input.content)" ;;
  Edit)  content="$(payload_get .tool_input.new_string)" ;;
  MultiEdit)
    content="$(python3 -c '
import json, os
raw = os.environ.get("HOOK_PAYLOAD","")
d = json.loads(raw) if raw else {}
edits = (d.get("tool_input") or {}).get("edits") or []
print("\n".join(e.get("new_string","") for e in edits))
')"
    ;;
esac

# Look for a PASS claim in the proposed content.
if ! python3 -c "
import re,sys
c = sys.argv[1]
lines = c.splitlines()
for ln in lines:
    s = ln.strip()
    if re.fullmatch(r'PASS', s):
        sys.exit(0)
    if re.match(r'(VERIFY|STATUS|RESULT|VERDICT)\s*[:=]\s*PASS\b', s, re.I):
        sys.exit(0)
sys.exit(1)
" "$content"; then
  emit_allow
fi

# A PASS claim is being written. Check the truth source.
TRUTH="$STATE_DIR/last_test_result"
if [ ! -f "$TRUTH" ]; then
  log_line verify_pass_guard "BLOCKED no truth source for PASS claim in $rel"
  emit_block "Verify Pass Guard: cannot persist a PASS line — no test evidence exists at .claude/state/last_test_result. Run the tests (or invoke the \`verify\` skill) to produce a verdict before claiming PASS."
fi

verdict="$(head -1 "$TRUTH" | tr -d '[:space:]')"
if [ "$verdict" != "PASS" ]; then
  log_line verify_pass_guard "BLOCKED verdict=$verdict claim=PASS file=$rel"
  emit_block "Verify Pass Guard: cannot persist a PASS line — the latest test verdict is '$verdict' (see .claude/state/last_test_result). Fix the failing tests first; do not edit the verification artifact to claim PASS."
fi

log_line verify_pass_guard "ALLOWED verdict=PASS file=$rel"
emit_allow
