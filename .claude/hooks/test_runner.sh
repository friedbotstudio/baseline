#!/usr/bin/env bash
# Test Runner hook — PostToolUse(Edit|Write|MultiEdit)
#
# Runs the project-configured test command against the changed file's
# affected tests. This is a GUIDE hook: until `.claude/project.json`
# declares `test.cmd`, it emits guidance pointing at `/init-project` rather
# than failing. Once configured, it executes the command and surfaces
# failures as stderr info (PostToolUse cannot block the edit that already
# happened, but it surfaces test failures immediately so Claude reacts).
#
# Projects are free to replace this script entirely with their own logic.

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

# Skip obviously non-code changes.
case "$rel" in
  *.md|*.json|*.yaml|*.yml|*.toml|*.txt|docs/*|.claude/*|.config/*) emit_allow ;;
esac

configured="$(project_get .configured)"
cmd="$(project_get .test.cmd)"

if [ "$configured" != "True" ] && [ "$configured" != "true" ]; then
  emit_info "Test Runner: .claude/project.json is not configured yet. Run \`/init-project\` to declare the test command for this repo. (Skipping test run for '$rel'.)"
  emit_allow
fi

if [ -z "$cmd" ] || [ "$cmd" = "None" ]; then
  emit_info "Test Runner: no .test.cmd set in .claude/project.json. Skipping tests for '$rel'."
  emit_allow
fi

# Resolve affected tests. If a custom resolver is configured, delegate to it;
# otherwise pass the changed file path and let the test command decide.
resolver="$(project_get .test.affected_resolver)"
affected=""
if [ -n "$resolver" ] && [ "$resolver" != "None" ]; then
  if [ -x "$CLAUDE_PROJECT_ROOT/$resolver" ]; then
    affected="$("$CLAUDE_PROJECT_ROOT/$resolver" "$rel" 2>/dev/null || true)"
  else
    emit_info "Test Runner: affected_resolver '$resolver' not found or not executable."
  fi
fi

timeout_s="$(project_get .test.timeout_seconds)"
[ -z "$timeout_s" ] && timeout_s=120

# Compose final command. {file} and {affected} placeholders are substituted.
final="${cmd//\{file\}/$rel}"
final="${final//\{affected\}/$affected}"

emit_info "Test Runner: running \`$final\` (timeout ${timeout_s}s)"
out="$(cd "$CLAUDE_PROJECT_ROOT" && timeout "${timeout_s}s" bash -lc "$final" 2>&1)"
rc=$?
if [ $rc -ne 0 ]; then
  log_line test_runner "FAIL rc=$rc cmd=$final"
  emit_info "Test Runner: FAILED (exit $rc) — output:"
  emit_info "$out"
  exit 2
fi

log_line test_runner "PASS cmd=$final"
emit_allow
