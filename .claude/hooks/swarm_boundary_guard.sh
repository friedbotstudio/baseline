#!/usr/bin/env bash
# Swarm Boundary Guard — PreToolUse(Write|Edit|MultiEdit)
#
# Enforces the swarm invariant: within an active wave, writes may only touch
# files that appear in some task's declared write_set. Because write_sets are
# pairwise disjoint within a wave (enforced by swarm-plan at plan time), any
# write uniquely maps back to exactly one task — so the guard does not need
# to identify which agent is writing. It only needs to verify the file is
# owned by SOMEONE in the active wave.
#
# Control file:
#   .claude/state/swarm/active_wave.json
# Format:
#   {
#     "slug": "<slug>",
#     "wave": <n>,
#     "started_at": <epoch>,
#     "write_sets": [
#       {"task_id": "T-001", "files": ["src/foo.py", "tests/foo_test.py"]},
#       ...
#     ]
#   }
#
# Semantics:
#   - active_wave.json missing        → not in swarm, allow.
#   - file path under an exempt prefix → allow (tooling/state/vcs writes).
#   - file path in enforced prefix and in union(write_sets) → allow.
#   - file path in enforced prefix and NOT in any write_set  → deny.
#   - file path NOT in enforced prefix → allow (hook scope is narrow on purpose).
#
# Exempt / enforced prefixes come from project.json → swarm.exempt_path_prefixes
# / swarm.enforced_path_prefixes. Sensible defaults if absent.

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

ACTIVE_WAVE="$STATE_DIR/swarm/active_wave.json"
if [ ! -f "$ACTIVE_WAVE" ]; then
  # Not in a swarm — guard is dormant.
  emit_allow
fi

HOOK_REL="$rel" HOOK_ACTIVE="$ACTIVE_WAVE" HOOK_PROJECT_JSON="$PROJECT_JSON" python3 <<'PY'
import json, os, sys

rel          = os.environ["HOOK_REL"]
active_path  = os.environ["HOOK_ACTIVE"]
pj_path      = os.environ["HOOK_PROJECT_JSON"]

# Load active wave.
try:
    active = json.load(open(active_path))
except Exception as e:
    # Corrupt active_wave.json — fail CLOSED. If we're inside a swarm we need
    # this file to be readable; if we can't read it, we cannot safely allow
    # arbitrary writes.
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": (
                f"Swarm Boundary Guard: active_wave.json exists but could not be parsed ({e}). "
                "This is a swarm-state corruption — swarm-dispatch must clean up and re-plan."
            ),
        }
    }))
    sys.exit(0)

# Load config.
exempt_prefixes = [".claude/", ".git/"]
enforced_prefixes = None
try:
    pj = json.load(open(pj_path))
    sw = (pj.get("swarm") or {})
    if isinstance(sw.get("exempt_path_prefixes"), list):
        exempt_prefixes = sw["exempt_path_prefixes"]
    if isinstance(sw.get("enforced_path_prefixes"), list):
        enforced_prefixes = sw["enforced_path_prefixes"]
except Exception:
    pass

# Exempt paths (tooling / vcs / deps) — never enforced.
for p in exempt_prefixes:
    if rel.startswith(p):
        sys.exit(0)

# If enforced_prefixes is set, only enforce within those roots.
# If absent, enforce on everything not exempt.
if enforced_prefixes is not None:
    if not any(rel.startswith(p) for p in enforced_prefixes):
        sys.exit(0)

# Build union of active write_sets.
write_sets = active.get("write_sets") or []
owners = {}  # file -> task_id
for entry in write_sets:
    tid = entry.get("task_id", "?")
    for f in (entry.get("files") or []):
        owners[f] = tid

if rel in owners:
    sys.exit(0)

# Plan drift: file not owned by any active task in this wave.
slug = active.get("slug", "?")
wave = active.get("wave", "?")
owners_preview = ", ".join(sorted(set(owners.keys()))[:6])
if len(owners) > 6:
    owners_preview += f", … ({len(owners)} total)"

msg = (
    f"Swarm Boundary Guard: write to '{rel}' denied. "
    f"Swarm '{slug}' wave {wave} is active; no task in this wave owns that file. "
    f"Files owned by this wave: {owners_preview or '(none)'}. "
    "Either (a) abort this write, (b) stop the swarm and re-plan so the file is in some task's write_set, "
    "or (c) if this is a genuinely required file that was missed at plan time, surface it — do not patch mid-wave."
)
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": msg,
    }
}))
PY
