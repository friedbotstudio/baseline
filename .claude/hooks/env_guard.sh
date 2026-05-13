#!/usr/bin/env bash
# .env file guard — PreToolUse(Edit|Write|MultiEdit|NotebookEdit)
#
# Blocks any write to files matching .env patterns that are likely to hold
# secrets. Allows .env.example / .env.sample (template files that don't hold
# real secrets).

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

TOOL="$(payload_get .tool_name)"
case "$TOOL" in
  Edit|Write|MultiEdit|NotebookEdit) ;;
  *) emit_allow ;;
esac

FILE="$(payload_get .tool_input.file_path)"
[ -n "$FILE" ] || emit_allow

base="$(basename "$FILE")"

# Allow clearly-safe template files.
case "$base" in
  .env.example|.env.sample|.env.template|.env.dist|.env.defaults) emit_allow ;;
esac

# Block anything else matching .env*.
case "$base" in
  .env|.env.*|*.env)
    log_line env_guard "BLOCKED $FILE"
    emit_block ".env file guard: '$FILE' looks like a secrets file. seed.md forbids edits to .env files. If this is a template, rename to .env.example."
    ;;
esac

emit_allow
