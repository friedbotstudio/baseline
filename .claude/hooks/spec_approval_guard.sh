#!/usr/bin/env bash
# Spec Approval Guard — PreToolUse(Write|Edit|MultiEdit)
#
# Three enforcement modes:
#
#   1. Approval artifacts (.claude/state/spec_approvals/*.approval) — only
#      writable when a fresh slug-matched consent marker exists at
#      .claude/state/.spec_approval_grant. The marker is written by
#      consent_gate_grant.mjs on /approve-spec invocation, OUTSIDE Claude's
#      tool boundary. Validated and consumed via validate_consent_marker.
#
#   2. The marker file itself — Claude SHALL NEVER write it via tool. The
#      marker is the structural source of consent; allowing Claude to write
#      it would defeat the gate.
#
#   3. Spec files (docs/specs/*.md) — block writes that add/modify an
#      "Approved" / "Status: Approved" line. The user must run /approve-spec.

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
rel="$(canonical_rel "$FILE")"
[ -n "$rel" ] || emit_allow

block_marker_self_write "$rel" "$CONSENT_MARKER_SPEC_REL" "Spec Approval Guard" "/approve-spec <path>"

case "$rel" in
  .claude/state/spec_approvals/*.approval)
    # Strip .approval, then canonical_slug to fold legacy `<slug>.md.approval`
    # and current `<slug>.approval` to the same bare slug as the marker.
    expected_slug="$(canonical_slug "$(basename "$rel" .approval)")"
    validate_consent_marker "$CONSENT_MARKER_SPEC" "Spec Approval Guard" "/approve-spec <slug|path>" "$expected_slug"
    emit_allow
    ;;
esac

case "$rel" in
  docs/specs/*.md) ;;
  *) emit_allow ;;
esac

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

if python3 -c "
import re, sys
c = sys.argv[1]
for ln in c.splitlines():
    s = ln.strip().lstrip('-').lstrip('*').strip()
    if re.match(r'(status|state|approval)\s*[:=]\s*approved\b', s, re.I):
        sys.exit(0)
    if re.fullmatch(r'approved\s*[:=]\s*true', s, re.I):
        sys.exit(0)
sys.exit(1)
" "$content"; then
  log_line spec_approval_guard "BLOCKED self-approval in: $rel"
  emit_block "Spec Approval Guard: Claude cannot mark a spec as Approved. The user must run \`/approve-spec $rel\`, which produces the consent marker that allows the approval token to be written. Remove the 'Approved' line from this edit."
fi

emit_allow
