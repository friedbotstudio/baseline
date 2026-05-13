#!/usr/bin/env bash
# Memory PreCompact — PreCompact event
#
# Fires before context compaction (manual /compact or auto). At this point
# the full transcript is still on disk; we walk it and write a continuity
# snapshot to .claude/memory/_resume.md. The next SessionStart (source:
# compact) re-injects that snapshot so the model knows where it left off.
#
# This hook NEVER blocks compaction. Snapshotting must be best-effort:
# a transcript-walk failure should not punish the user.
#
# Per docs: PreCompact stdout is NOT injected into context (only logged).
# So all useful output goes to disk; this hook prints nothing on stdout.

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

TRANSCRIPT="$(payload_get .transcript_path)"
TRIGGER="$(payload_get .trigger)"
[ -n "$TRIGGER" ] || TRIGGER="auto"

# If we can't find the transcript, log and bail — never fail compaction.
if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  log_line memory_pre_compact "no transcript path; skipped (trigger=$TRIGGER)"
  exit 0
fi

MEM_DIR="$CLAUDE_DOTDIR/memory"
[ -d "$MEM_DIR" ] || { log_line memory_pre_compact "memory dir missing; skipped"; exit 0; }

python3 "$CLAUDE_DOTDIR/hooks/lib/resume_writer.py" \
  "$TRANSCRIPT" "$CLAUDE_PROJECT_ROOT" "pre-compact" 2>>"$LOG_DIR/memory_pre_compact.log" || true

log_line memory_pre_compact "wrote _resume.md (trigger=$TRIGGER)"
exit 0
