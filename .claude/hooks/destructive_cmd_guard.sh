#!/usr/bin/env bash
# Destructive Command Guard — PreToolUse(Bash)
#
# Two tiers:
#   - hard_block_patterns: block outright, cannot be overridden here (user
#     would need to remove the pattern from project.json).
#   - ask_patterns: emit an "ask" decision so the user is prompted each time.
#
# Patterns come from .destructive.hard_block_patterns / .destructive.ask_patterns
# in .claude/project.json. Mode selector .destructive.mode is "ask" (default)
# or "block" — block upgrades ask_patterns to deny.

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

TOOL="$(payload_get .tool_name)"
[ "$TOOL" = "Bash" ] || emit_allow

CMD="$(payload_get .tool_input.command)"
[ -n "$CMD" ] || emit_allow

hard="$(project_get .destructive.hard_block_patterns)"
if [ -n "$hard" ] && cmd_matches_any "$CMD" "$hard"; then
  log_line destructive_cmd_guard "HARD BLOCK: $CMD"
  emit_block "Destructive Command Guard: '$CMD' matches a hard-block pattern (catastrophic/irreversible). This is not overridable by confirmation. If this is genuinely necessary, edit .claude/project.json .destructive.hard_block_patterns."
fi

mode="$(project_get .destructive.mode)"
[ -z "$mode" ] && mode="ask"

ask="$(project_get .destructive.ask_patterns)"
if [ -n "$ask" ] && cmd_matches_any "$CMD" "$ask"; then
  if [ "$mode" = "block" ]; then
    log_line destructive_cmd_guard "BLOCK (mode=block): $CMD"
    emit_block "Destructive Command Guard: '$CMD' matches a destructive pattern and mode=block. Ask the user to run this themselves, or set .destructive.mode to 'ask' in project.json."
  fi
  log_line destructive_cmd_guard "ASK: $CMD"
  emit_ask "Destructive Command Guard: '$CMD' looks destructive (matches an ask pattern). Confirm this is intentional before proceeding."
fi

emit_allow
