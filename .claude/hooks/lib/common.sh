#!/usr/bin/env bash
# Shared helpers for baseline Claude Code hook scripts.
# Sourced by every hook in .claude/hooks/.
#
# Contract:
#   - Hooks receive a JSON payload on stdin (the Claude Code hook event).
#   - Hooks emit JSON to stdout for structured decisions, or exit non-zero with
#     a stderr message to block/warn.
#   - All hooks must be resilient to a missing/invalid project.json.
#
# Dependencies: bash >= 4, python3 (JSON parsing — POSIX-portable enough for
# macOS + modern Linux). No jq requirement.

set -u

# Defensive PATH: hooks may be invoked with a minimal environment. Ensure the
# standard utilities (dirname, cat, date, etc.) and python3 are findable.
export PATH="${PATH:-}:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:/usr/sbin:/sbin"
if [ -z "${PATH%%:*}" ]; then
  PATH="${PATH#:}"
  export PATH
fi

CLAUDE_PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CLAUDE_DOTDIR="$CLAUDE_PROJECT_ROOT/.claude"
PROJECT_JSON="$CLAUDE_DOTDIR/project.json"
STATE_DIR="$CLAUDE_DOTDIR/state"
LOG_DIR="$STATE_DIR/logs"
mkdir -p "$STATE_DIR" "$LOG_DIR" 2>/dev/null || true

# Read the raw hook JSON payload from stdin into HOOK_PAYLOAD.
read_payload() {
  HOOK_PAYLOAD="$(cat)"
  export HOOK_PAYLOAD
}

# Extract a field from the hook payload using a jsonpath-ish dotted path.
# Usage: payload_get '.tool_input.command'
# Requires read_payload to have been called first (so HOOK_PAYLOAD is set).
payload_get() {
  local path="$1"
  python3 - "$path" <<'PY'
import json, os, sys
path = sys.argv[1]
raw = os.environ.get("HOOK_PAYLOAD", "")
if not raw:
    sys.exit(0)
try:
    data = json.loads(raw)
except Exception:
    sys.exit(0)
cur = data
for part in path.strip('.').split('.'):
    if part == '':
        continue
    if isinstance(cur, dict):
        cur = cur.get(part)
    else:
        cur = None
        break
if cur is None:
    sys.exit(0)
if isinstance(cur, (dict, list)):
    print(json.dumps(cur))
else:
    print(cur)
PY
}

# Read a field from .claude/project.json at a dotted path.
# Prints empty string if project.json or key is missing.
project_get() {
  local path="$1"
  [ -f "$PROJECT_JSON" ] || { echo ""; return 0; }
  python3 - "$path" "$PROJECT_JSON" <<'PY'
import json, sys
path, pj = sys.argv[1], sys.argv[2]
try:
    with open(pj) as f:
        data = json.load(f)
except Exception:
    sys.exit(0)
cur = data
for part in path.strip('.').split('.'):
    if part == '':
        continue
    if isinstance(cur, dict):
        cur = cur.get(part)
    else:
        cur = None
        break
if cur is None:
    sys.exit(0)
if isinstance(cur, (dict, list)):
    print(json.dumps(cur))
else:
    print(cur)
PY
}

# Emit a structured block decision (PreToolUse).
# Usage: emit_block "reason text"
emit_block() {
  local reason="$1"
  python3 - "$reason" <<'PY'
import json, sys
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": sys.argv[1],
    }
}))
PY
  exit 0
}

# Emit a structured ask decision (PreToolUse).
emit_ask() {
  local reason="$1"
  python3 - "$reason" <<'PY'
import json, sys
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "ask",
        "permissionDecisionReason": sys.argv[1],
    }
}))
PY
  exit 0
}

# Emit an allow (no-op) decision. Equivalent to exit 0 with no output, but
# explicit for clarity.
emit_allow() {
  exit 0
}

# Emit an informational message (PostToolUse or advisory PreToolUse). Does not
# block. Printed to stderr so it surfaces in the transcript without polluting
# stdout (which Claude Code interprets as structured output).
emit_info() {
  printf '%s\n' "$1" >&2
}

# Append a line to a hook-specific log for debugging. Never fails the hook.
log_line() {
  local hook="$1" msg="$2"
  printf '%s  %s\n' "$(date -u +%FT%TZ)" "$msg" >>"$LOG_DIR/$hook.log" 2>/dev/null || true
}

# True if the given path matches any glob in a JSON array (from project_get).
# Usage: path_matches_globs "src/foo.py" "$(project_get .tdd.source_globs)"
path_matches_globs() {
  local path="$1" globs_json="$2"
  [ -z "$globs_json" ] && return 1
  python3 - "$path" "$globs_json" <<'PY'
import json, sys, fnmatch
path, globs_json = sys.argv[1], sys.argv[2]
try:
    globs = json.loads(globs_json)
except Exception:
    sys.exit(1)
if not isinstance(globs, list):
    sys.exit(1)
for g in globs:
    if fnmatch.fnmatchcase(path, g) or fnmatch.fnmatchcase(path, g.rstrip('/**') + '/*'):
        sys.exit(0)
    # also handle simple ** recursion
    if '**' in g:
        # translate ** to match any depth
        import re
        pat = re.escape(g).replace(r'\*\*', '.*').replace(r'\*', '[^/]*').replace(r'\?', '.')
        if re.fullmatch(pat, path):
            sys.exit(0)
sys.exit(1)
PY
}

# True if stdin command matches any pattern in a JSON-array-of-regex.
# Usage: cmd_matches_any "$cmd" "$(project_get .destructive.hard_block_patterns)"
cmd_matches_any() {
  local cmd="$1" patterns_json="$2"
  [ -z "$patterns_json" ] && return 1
  python3 - "$cmd" "$patterns_json" <<'PY'
import json, sys, re
cmd, patterns_json = sys.argv[1], sys.argv[2]
try:
    patterns = json.loads(patterns_json)
except Exception:
    sys.exit(1)
for p in patterns:
    try:
        if re.search(p, cmd):
            sys.exit(0)
    except re.error:
        continue
sys.exit(1)
PY
}

# Canonicalize a path and make it relative to CLAUDE_PROJECT_ROOT.
# Lexical only — collapses ./ and ../ via os.path.normpath, does NOT resolve
# symlinks. This is deliberate: symlink resolution would let a path like
# .claude/state/spec_approvals/foo.approval (whose final component is a
# symlink to /tmp/x) silently redirect, defeating the case-pattern checks.
# Symlink-swap defense is a separate hardening (see seed.md §16 follow-ups).
#
# Returns the project-relative canonical path on stdout, or an absolute
# canonical path if the input escapes the project root. Empty if input is
# empty or equals the project root.
canonical_rel() {
  python3 - "$1" "$CLAUDE_PROJECT_ROOT" <<'PY'
import os, sys
file_path = sys.argv[1]
root = sys.argv[2]
if not file_path:
    sys.exit(0)
norm = os.path.normpath(os.path.abspath(file_path))
norm_root = os.path.normpath(os.path.abspath(root))
sep = os.sep
if norm == norm_root:
    print("")
elif norm.startswith(norm_root + sep):
    print(norm[len(norm_root) + 1:])
else:
    print(norm)
PY
}

# Consent-gate marker file paths — written ONLY by consent_gate_grant.sh
# (UserPromptSubmit) when the user invokes the corresponding slash command,
# read by the gate guards (PreToolUse) before allowing approval-token writes.
# Hooks reference these constants instead of literal paths so a rename is a
# one-line change. Relative variants are for case-pattern matching against
# tool_input.file_path after CLAUDE_PROJECT_ROOT stripping.
CONSENT_MARKER_SPEC="$STATE_DIR/.spec_approval_grant"
CONSENT_MARKER_SWARM="$STATE_DIR/.swarm_approval_grant"
CONSENT_MARKER_COMMIT="$STATE_DIR/.commit_consent_grant"
CONSENT_MARKER_SPEC_REL=".claude/state/.spec_approval_grant"
CONSENT_MARKER_SWARM_REL=".claude/state/.swarm_approval_grant"
CONSENT_MARKER_COMMIT_REL=".claude/state/.commit_consent_grant"

# Reduce any user-typed approval argument (bare slug, filename, or path) to a
# bare slug. Called from BOTH ends of the consent handshake so the marker and
# the expected-slug check produce the same shape:
#   docs/specs/foo.md  -> foo
#   foo.md             -> foo
#   foo                -> foo
#   approval-slug-canonicalization -> approval-slug-canonicalization
# Also used by the approval guards: feed in basename(file, .approval) to
# canonicalize legacy `<slug>.md.approval` and current `<slug>.approval` to
# the same bare slug, so both filename shapes validate.
canonical_slug() {
  local s="${1##*/}"
  printf '%s' "${s%.md}"
}

# Block Claude from writing a consent-marker file via Write/Edit/MultiEdit.
# The marker's unforgeability is what makes the consent gate structural —
# only consent_gate_grant (UserPromptSubmit, outside Claude's tool boundary)
# may produce it.
#
# Args: $1 rel_path  $2 marker_rel_path  $3 gate_label  $4 user_command_hint
# Calls emit_block (which exits) on match; returns 0 otherwise.
block_marker_self_write() {
  local rel="$1" marker_rel="$2" gate_label="$3" cmd_hint="$4"
  local hook_log="${gate_label// /_}"
  hook_log="${hook_log,,}"
  if [ "$rel" = "$marker_rel" ]; then
    log_line "$hook_log" "BLOCKED direct write to consent marker: $rel"
    emit_block "$gate_label: '$rel' is a consent marker written by the consent_gate_grant UserPromptSubmit hook in response to \`$cmd_hint\`. Claude is not permitted to create or edit this marker — its unforgeability is what makes the gate structurally enforced."
  fi
}

# Validate a consent marker (freshness + optional slug match) and consume it.
# emit_blocks (and exits) on any failure; returns 0 on success after deleting
# the marker. TTL comes from .consent.gate_marker_ttl_seconds (default 60).
#
# Args: $1 marker_path  $2 gate_label  $3 user_command_hint  [$4 expected_slug]
#
# Marker shape:
#   - With slug ($4 non-empty):  line 1 = slug, line 2 = epoch.
#   - Epoch-only ($4 empty):     line 1 = epoch.
validate_consent_marker() {
  local marker="$1" gate_label="$2" cmd_hint="$3" expected_slug="${4:-}"
  local hook_log ttl marker_slug marker_epoch now age
  hook_log="${gate_label// /_}"
  hook_log="${hook_log,,}"

  ttl="$(project_get .consent.gate_marker_ttl_seconds)"
  [ -z "$ttl" ] && ttl=120

  if [ ! -f "$marker" ]; then
    log_line "$hook_log" "BLOCKED no marker: $marker"
    emit_block "$gate_label: requires a fresh consent marker at $marker. The marker is produced by the consent_gate_grant hook when the user runs \`$cmd_hint\` — Claude cannot create it."
  fi

  if [ -n "$expected_slug" ]; then
    { read -r marker_slug; read -r marker_epoch; } < "$marker" 2>/dev/null
  else
    read -r marker_epoch < "$marker" 2>/dev/null
    marker_slug=""
  fi

  if ! [[ "$marker_epoch" =~ ^[0-9]+$ ]]; then
    log_line "$hook_log" "BLOCKED malformed marker: $marker"
    emit_block "$gate_label: marker at $marker is malformed. Ask the user to re-run \`$cmd_hint\`."
  fi

  now="$(date +%s)"
  age=$(( now - marker_epoch ))
  if [ "$age" -gt "$ttl" ]; then
    log_line "$hook_log" "BLOCKED marker expired age=${age}s ttl=${ttl}s"
    rm -f "$marker"
    emit_block "$gate_label: consent marker expired (${age}s old, TTL ${ttl}s). Ask the user to re-run \`$cmd_hint\`."
  fi

  if [ -n "$expected_slug" ] && [ "$marker_slug" != "$expected_slug" ]; then
    log_line "$hook_log" "BLOCKED slug mismatch marker=$marker_slug expected=$expected_slug"
    emit_block "$gate_label: marker slug ($marker_slug) does not match expected ($expected_slug). Ask the user to re-run \`$cmd_hint\` with the correct argument."
  fi

  log_line "$hook_log" "ALLOWED marker=$marker age=${age}s slug=${marker_slug:-N/A}"
  rm -f "$marker"
  return 0
}
