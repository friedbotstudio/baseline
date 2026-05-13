#!/usr/bin/env bash
# Setup Guard — PreToolUse(Write|Edit|MultiEdit)
#
# Advisory only. When `.claude/project.json` reports `configured: false`,
# this hook emits a one-time-per-period info message reminding the user
# that the baseline is in project-agnostic mode (test/lint runners are
# in guide mode, no stack-specific tailoring). It does NOT block writes.
#
# Bypass is intentionally allowed — the user gets baseline-only behaviour
# until they run `/init-project`. Other guards (commit, env, spec-approval,
# verify-pass, track) remain hard.
#
# Deduplication: the warning prints only when no warn marker has been
# touched in the last 600s. This keeps editing-heavy sessions from
# spamming. Re-warns at the start of each new session naturally
# (file mtime ages out).

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

# Already configured → no-op.
configured="$(project_get .configured)"
if [ "$configured" = "True" ] || [ "$configured" = "true" ]; then
  emit_allow
fi

# Configured=false. Emit a one-time-per-period advisory and allow the write.
WARN_MARKER="$STATE_DIR/setup_guard_last_warn"
NOW="$(date +%s 2>/dev/null || echo 0)"
LAST="$(stat -f %m "$WARN_MARKER" 2>/dev/null || stat -c %Y "$WARN_MARKER" 2>/dev/null || echo 0)"
SINCE=$((NOW - LAST))

if [ "$SINCE" -ge 600 ] || [ "$LAST" = "0" ]; then
  emit_info "Setup Guard (advisory): \`.claude/project.json\` reports configured=false. The baseline is running in project-agnostic mode — test_runner and lint_runner hooks are in guide mode and no stack-specific tailoring has been applied. Run \`/init-project\` to scout the codebase, invoke the recommender, and generate a tailored config. (This warning is rate-limited to once per 10 minutes.)"
  : > "$WARN_MARKER" 2>/dev/null || true
fi

log_line setup_guard "advisory pre-init write to $rel (warned=$([ "$SINCE" -ge 600 ] && echo yes || echo no))"
emit_allow
