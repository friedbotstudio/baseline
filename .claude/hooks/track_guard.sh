#!/usr/bin/env bash
# Track Guard — PreToolUse(Write|Edit|MultiEdit)
#
# Enforces workflow phase ordering at the Write boundary. Reads the active
# workflow from .claude/state/workflow.json (written by /triage). When Claude
# tries to create/edit an artifact for phase N, all prior phases up to N-1
# must either (a) have their artifact present or (b) be listed in the
# triage `exceptions` array.
#
# Phase order + artifact globs come from .workflow.phases / .workflow.artifacts
# in .claude/project.json.

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

WORKFLOW_STATE="$STATE_DIR/workflow.json"
# If no active workflow, nothing to enforce — triage hasn't run yet, which
# is fine for quickfix / ad-hoc work.
[ -f "$WORKFLOW_STATE" ] || emit_allow

# Delegate phase ordering logic to python for clarity.
python3 - "$rel" "$WORKFLOW_STATE" "$PROJECT_JSON" <<'PY'
import json, sys, os, fnmatch, re
rel, workflow_state, project_json = sys.argv[1], sys.argv[2], sys.argv[3]

def glob_match(path, pat):
    if fnmatch.fnmatchcase(path, pat):
        return True
    if '**' in pat:
        rx = re.escape(pat).replace(r'\*\*', '.*').replace(r'\*', '[^/]*').replace(r'\?', '.')
        return bool(re.fullmatch(rx, path))
    return False

try:
    ws = json.load(open(workflow_state))
except Exception:
    sys.exit(0)  # malformed → don't block
try:
    pj = json.load(open(project_json))
except Exception:
    sys.exit(0)

phases = pj.get("workflow", {}).get("phases") or []
artifacts = pj.get("workflow", {}).get("artifacts") or {}
exceptions = set(ws.get("exceptions") or [])
# Post-§18: workflow.json carries `track_id`; legacy pre-§18 files carry
# `entry_phase`. Accept both. The canonical map below mirrors
# `src/cli/workflow-migrator.js → ENTRY_PHASE_TO_TRACK_ID` in reverse so
# track_guard's phase-ordering enforcement keeps working on both shapes.
_TRACK_ID_TO_ENTRY_PHASE = {
    "intake-full": "intake",
    "spec-entry": "spec",
    "tdd-quickfix": "tdd",
    "chore": "chore",
}
entry = ws.get("entry_phase") or _TRACK_ID_TO_ENTRY_PHASE.get(ws.get("track_id"))

# Find which phase this file belongs to.
file_phase = None
for ph in phases:
    pat = artifacts.get(ph)
    if pat and glob_match(rel, pat):
        file_phase = ph
        break

if file_phase is None:
    sys.exit(0)  # file is not a workflow artifact → allow

# Find index of file_phase and entry_phase.
try:
    file_idx = phases.index(file_phase)
except ValueError:
    sys.exit(0)
entry_idx = phases.index(entry) if entry in phases else 0

# Only enforce ordering from the entry phase onward.
missing = []
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(workflow_state))))
# project_root = repo root (workflow_state is .claude/state/workflow.json)
for i in range(entry_idx, file_idx):
    ph = phases[i]
    if ph in exceptions:
        continue
    pat = artifacts.get(ph)
    if not pat:
        # phase has no artifact (e.g. tdd/simplify) — consider it satisfied
        # only if workflow_state.completed includes it.
        if ph in (ws.get("completed") or []):
            continue
        missing.append(ph)
        continue
    # Look for any file matching the artifact glob under project_root.
    found = False
    for root, _dirs, files in os.walk(project_root):
        # skip heavy dirs
        parts = root.replace(project_root, '', 1).lstrip('/').split('/')
        if parts and parts[0] in ('.git', 'node_modules', '.config', '.claude'):
            if ph != 'review':  # review artifacts live under .claude/state/
                continue
        for f in files:
            candidate = os.path.relpath(os.path.join(root, f), project_root)
            if glob_match(candidate, pat):
                found = True
                break
        if found:
            break
    if not found:
        missing.append(ph)

if missing:
    msg = (
        f"Track Guard: cannot write '{rel}' (phase '{file_phase}') — "
        f"prior phases not completed: {', '.join(missing)}. "
        f"Either produce those artifacts first, or inject exceptions via /triage."
    )
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": msg,
        }
    }))
PY

# If python printed a block decision, exit 0 (decision is in stdout).
exit 0
