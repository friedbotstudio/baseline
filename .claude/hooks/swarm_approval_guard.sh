#!/usr/bin/env bash
# Swarm Approval Guard — PreToolUse(Write|Edit|MultiEdit)
#
# Symmetric to spec_approval_guard for gate B (/approve-swarm). Two modes:
#
#   1. Approval artifacts (.claude/state/swarm_approvals/<slug>.approval) —
#      writable only when a fresh slug-matched marker at
#      .claude/state/.swarm_approval_grant exists. Marker is written by
#      consent_gate_grant.mjs on /approve-swarm. Validated + consumed via
#      validate_consent_marker.
#
#   2. The marker file itself — Claude SHALL NEVER write it via tool.

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

block_marker_self_write "$rel" "$CONSENT_MARKER_SWARM_REL" "Swarm Approval Guard" "/approve-swarm <slug>"

case "$rel" in
  .claude/state/swarm_approvals/*.approval)
    expected_slug="$(canonical_slug "$(basename "$rel" .approval)")"
    validate_consent_marker "$CONSENT_MARKER_SWARM" "Swarm Approval Guard" "/approve-swarm <slug>" "$expected_slug"
    emit_allow
    ;;
esac

emit_allow
