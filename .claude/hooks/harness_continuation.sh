#!/usr/bin/env bash
# Harness Continuation — Stop event
#
# Auto-continues multi-phase workflows across non-gated phase boundaries.
# Reads .claude/state/harness_state (written by the harness skill on every
# tick) and decides whether to re-fire harness on the same turn or stay
# silent.
#
# Gate has two disjunctive paths, both gated by rung 1:
#   Path A (mid-loop continuation):
#     1. stop_hook_active flag absent on payload (avoids in-turn recursion).
#     2. .claude/state/.harness_active marker exists (session-scoped).
#     3. harness_state.state equals "continue".
#   Path B (rung 4 — gate-resume after a consent slash command):
#     1. stop_hook_active flag absent.
#     4a. harness_state.state equals "yielded".
#     4b. .claude/state/workflow.json exists and parses.
#     4c. at least one of {commit_consent, push_consent,
#         spec_approvals/<slug>.approval, swarm_approvals/<slug>.approval}
#         exists with mtime newer than harness_state's mtime.
#   If Path A or Path B passes, the sanity rail runs and a block decision
#   is emitted. Otherwise: exit 0 silent.
#
# Sanity rail: if the marker's slug content disagrees with workflow.json.slug,
# log one WARN line to harness_continuation.log; the decision is unchanged.
#
# Internal failures are treated as silence.

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

# Marker path (presence check is now inside Python — Path B can fire with
# the marker absent).
MARKER="$STATE_DIR/.harness_active"

# harness_state existence — both paths need it readable.
HARNESS_STATE="$STATE_DIR/harness_state"
if [ ! -r "$HARNESS_STATE" ]; then
  log_line harness_continuation "silent: harness_state missing or unreadable"
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


def _read_workflow_slug():
    """Return slug string from workflow.json, or None if file missing/unparseable.

    An empty-string return ('') means the file exists and parses but has no
    slug field — workflow.json present but ungated by slug.
    """
    if not workflow_path or not os.path.exists(workflow_path):
        return None
    try:
        with open(workflow_path) as f:
            wf = json.load(f)
        return wf.get('slug') or ''
    except Exception:
        return None


def _any_consent_newer_than(reference_mtime, workflow_slug):
    """Rung 4c: is there a consent/approval token with mtime > reference_mtime?

    Scans four canonical paths under $STATE_DIR. The two slug-gated paths
    (spec_approvals, swarm_approvals) only check when workflow_slug is
    non-empty.
    """
    state_dir = os.path.dirname(state_path)
    candidates = [
        os.path.join(state_dir, 'commit_consent'),
        os.path.join(state_dir, 'push_consent'),
    ]
    if workflow_slug:
        candidates.append(
            os.path.join(state_dir, 'spec_approvals', f'{workflow_slug}.approval')
        )
        candidates.append(
            os.path.join(state_dir, 'swarm_approvals', f'{workflow_slug}.approval')
        )
    for path in candidates:
        try:
            if os.path.getmtime(path) > reference_mtime:
                return True
        except OSError:
            continue
    return False


# Parse harness_state and capture its mtime (rung 4 uses the mtime for the
# fresh-consent comparison).
try:
    state_mtime = os.path.getmtime(state_path)
    with open(state_path) as f:
        data = json.load(f)
except Exception as e:
    _log('INFO', f'silent: harness_state unparseable ({e!s})')
    sys.exit(0)

state_value = data.get('state')

# Read workflow.json's slug ONCE; both Path B's rung-4 check and the sanity
# rail consume it. None = missing/unparseable; '' = present but no slug.
workflow_slug = _read_workflow_slug()

# Branch on state. Path A handles 'continue'; Path B (rung 4) handles
# 'yielded'. Anything else is silent.
emit_log_detail = ''

if state_value == 'continue':
    # Path A: marker must be present (rung 2).
    if not marker_path or not os.path.exists(marker_path):
        _log('INFO', 'silent: rung2 marker missing for Path A (state=continue)')
        sys.exit(0)
    emit_log_detail = 'Path A (state=continue + marker present)'
elif state_value == 'yielded':
    # Path B (rung 4): workflow.json must exist; a consent token must be
    # newer than harness_state mtime.
    if workflow_slug is None:
        _log('INFO', 'silent: rung4 workflow.json missing or unparseable')
        sys.exit(0)
    if not _any_consent_newer_than(state_mtime, workflow_slug):
        _log('INFO', 'silent: rung4 no consent token newer than harness_state')
        sys.exit(0)
    emit_log_detail = 'Path B (rung 4, state=yielded + fresh consent)'
else:
    _log('INFO', f'silent: state={state_value!r} (not "continue" or "yielded")')
    sys.exit(0)

# Sanity rail: marker slug should match workflow.json slug. Mismatch is a
# WARN log line; the decision is unchanged.
marker_slug = ''
if marker_path and os.path.exists(marker_path):
    try:
        with open(marker_path) as f:
            marker_slug = f.read().strip()
    except Exception:
        marker_slug = ''

rail_workflow_slug = workflow_slug or ''
if marker_slug and rail_workflow_slug and marker_slug != rail_workflow_slug:
    _warn(f'slug mismatch: marker={marker_slug} workflow={rail_workflow_slug}')

# Gate passed — emit the block decision.
decision = {
    'decision': 'block',
    'reason': 'Workflow continuing per harness_state. Invoke Skill(harness) to advance to the next phase.',
}
print(json.dumps(decision))
_log('INFO', f'emit: decision=block ({emit_log_detail})')
PY

exit 0
