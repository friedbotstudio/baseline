#!/usr/bin/env bash
# Lint Runner hook — PostToolUse(Edit|Write|MultiEdit)
#
# Runs the project-configured lint command against the changed file.
# Guide-mode behaviour matches test_runner.sh: until `.claude/project.json`
# is configured, emits guidance rather than failing.

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

TOOL="$(payload_get .tool_name)"
case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) emit_allow ;;
esac

FILE="$(payload_get .tool_input.file_path)"
[ -n "$FILE" ] || emit_allow
rel="${FILE#$CLAUDE_PROJECT_ROOT/}"

case "$rel" in
  *.md|*.json|*.yaml|*.yml|*.toml|*.txt|docs/*|.claude/*|.config/*) emit_allow ;;
esac

configured="$(project_get .configured)"
cmd="$(project_get .lint.cmd)"

if [ "$configured" != "True" ] && [ "$configured" != "true" ]; then
  emit_info "Lint Runner: .claude/project.json is not configured yet. Run \`/init-project\` to declare the lint command."
  emit_allow
fi

if [ -z "$cmd" ] || [ "$cmd" = "None" ]; then
  emit_info "Lint Runner: no .lint.cmd set in .claude/project.json. Skipping lint for '$rel'."
  emit_allow
fi

timeout_s="$(project_get .lint.timeout_seconds)"
[ -z "$timeout_s" ] && timeout_s=60

final="${cmd//\{file\}/$rel}"

emit_info "Lint Runner: running \`$final\` (timeout ${timeout_s}s)"
out="$(cd "$CLAUDE_PROJECT_ROOT" && timeout "${timeout_s}s" bash -lc "$final" 2>&1)"
rc=$?
if [ $rc -ne 0 ]; then
  log_line lint_runner "FAIL rc=$rc cmd=$final"
  emit_info "Lint Runner: FAILED (exit $rc) — output:"
  emit_info "$out"
  exit 2
fi

log_line lint_runner "PASS cmd=$final"
emit_allow
