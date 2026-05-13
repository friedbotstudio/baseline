#!/usr/bin/env bash
# Harness Continuation — Stop event
#
# Auto-continues multi-phase workflows across non-gated phase boundaries.
# Reads .claude/state/harness_state (written by the harness skill on every
# tick) and decides whether to re-fire harness on the same turn or stay
# silent.
#
# Three-rung gate (plus sanity rail) — ALL three must pass to emit a block:
#   1. stop_hook_active flag absent on payload (avoids in-turn recursion).
#   2. .claude/state/.harness_active exists (session-scoped in-the-loop marker;
#      the harness skill creates it on continue, deletes it on yielded/done;
#      memory_session_start.sh deletes it on session boundary).
#   3. harness_state.state equals "continue".
#
# Sanity rail: if the marker's slug content disagrees with workflow.json.slug,
# log one WARN line to harness_continuation.log; the decision is unchanged.
#
# If all three pass, emit {"decision":"block","reason":"..."} to stdout.
# Otherwise: exit 0 silent. Internal failures are treated as silence.

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

# Rung 1: stop_hook_active prevents recursive re-firing inside a single turn.
STOP_ACTIVE="$(payload_get .stop_hook_active)"
case "$STOP_ACTIVE" in
  true|True|TRUE)
    log_line harness_continuation "silent: rung1 stop_hook_active=true"
    exit 0
    ;;
esac

# Rung 2: active marker presence — session-scoped "in the loop" signal.
MARKER="$STATE_DIR/.harness_active"
if [ ! -f "$MARKER" ]; then
  log_line harness_continuation "silent: rung2 marker missing ($MARKER)"
  exit 0
fi

# Rung 3 (plus sanity rail + emit) — delegate to python for JSON parsing.
HARNESS_STATE="$STATE_DIR/harness_state"
if [ ! -r "$HARNESS_STATE" ]; then
  log_line harness_continuation "silent: rung3a harness_state missing or unreadable"
  exit 0
fi

HARNESS_STATE="$HARNESS_STATE" \
  WORKFLOW_JSON="$STATE_DIR/workflow.json" \
  MARKER_PATH="$MARKER" \
  LOG_PATH="$LOG_DIR/harness_continuation.log" \
  python3 <<'PY' || exit 0
import json, os, sys, time

state_path = os.environ['HARNESS_STATE']
workflow_path = os.environ.get('WORKFLOW_JSON', '')
marker_path = os.environ.get('MARKER_PATH', '')
log_path = os.environ.get('LOG_PATH', '')


def _log(level, message):
    if not log_path:
        return
    try:
        with open(log_path, 'a') as f:
            ts = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            f.write(f'{ts}  {level}  {message}\n')
    except Exception:
        pass


def _warn(message):
    _log('WARN', message)


# Rung 3: parse harness_state and check state field.
try:
    with open(state_path) as f:
        data = json.load(f)
except Exception as e:
    _log('INFO', f'silent: rung3b harness_state unparseable ({e!s})')
    sys.exit(0)

state_value = data.get('state')
if state_value != 'continue':
    _log('INFO', f'silent: rung3c state={state_value!r} (expected "continue")')
    sys.exit(0)

# Sanity rail: marker slug should match workflow.json slug.
# Mismatch is a WARN log line; the decision is unchanged.
marker_slug = ''
if marker_path and os.path.exists(marker_path):
    try:
        with open(marker_path) as f:
            marker_slug = f.read().strip()
    except Exception:
        marker_slug = ''

workflow_slug = ''
if workflow_path and os.path.exists(workflow_path):
    try:
        with open(workflow_path) as f:
            wf = json.load(f)
        workflow_slug = wf.get('slug') or ''
    except Exception:
        workflow_slug = ''

if marker_slug and workflow_slug and marker_slug != workflow_slug:
    _warn(f'slug mismatch: marker={marker_slug} workflow={workflow_slug}')

# All rungs passed — emit the block decision.
decision = {
    'decision': 'block',
    'reason': 'Workflow continuing per harness_state. Invoke Skill(harness) to advance to the next phase.',
}
print(json.dumps(decision))
_log('INFO', 'emit: decision=block (all rungs passed)')
PY

exit 0
