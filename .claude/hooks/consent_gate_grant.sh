#!/usr/bin/env bash
# Consent Gate Grant — UserPromptSubmit
#
# When the user types one of the three consent-gate slash commands —
# /approve-spec, /approve-swarm, /grant-commit — this hook fires BEFORE the
# model is invoked. It writes a short-lived consent marker to
# .claude/state/.<gate>_grant.
#
# The marker is what makes the corresponding approval-token write succeed:
# the gate-specific PreToolUse guard (spec_approval_guard, swarm_approval_guard,
# git_commit_guard) reads the marker and allows Claude's write only if a
# fresh, slug-matched marker is on disk.
#
# Why the marker is unforgeable by Claude:
#   - This hook runs on UserPromptSubmit, OUTSIDE Claude's tool boundary.
#   - The PreToolUse guards block Claude from writing the marker file.
#   - Markers expire after consent.gate_marker_ttl_seconds (default 60).
#
# Marker shapes (also documented in lib/common.sh validate_consent_marker):
#   .spec_approval_grant   line 1: basename of spec path (slug)
#                          line 2: epoch
#                          line 3: absolute spec path
#   .swarm_approval_grant  line 1: slug · line 2: epoch
#   .commit_consent_grant  line 1: epoch · line 2: optional note

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

# Fast-path: glob-match against the raw payload to rule out 99% of prompts
# before any json/regex parsing. False positives are tolerated; the regex
# dispatch below would no-op anyway.
case "$HOOK_PAYLOAD" in
  *'"prompt":'*/approve-spec*) ;;
  *'"prompt":'*/approve-swarm*) ;;
  *'"prompt":'*/grant-commit*) ;;
  *) exit 0 ;;
esac

PROMPT="$(payload_get .prompt)"
[ -n "$PROMPT" ] || exit 0

first_line="${PROMPT%%$'\n'*}"
trimmed="${first_line#"${first_line%%[![:space:]]*}"}"

NOW="$(date +%s)"

write_marker_atomic() {
  local marker="$1"
  shift
  local tmp="${marker}.tmp.$$"
  if printf '%s\n' "$@" >"$tmp" 2>/dev/null && mv -f "$tmp" "$marker" 2>/dev/null; then
    return 0
  fi
  rm -f "$tmp" 2>/dev/null || true
  return 1
}

if [[ "$trimmed" =~ ^/approve-spec[[:space:]]+([^[:space:]]+) ]]; then
  arg="${BASH_REMATCH[1]}"
  slug="$(canonical_slug "$arg")"
  case "$arg" in
    /*)  abs_path="$arg" ;;
    */*) abs_path="$CLAUDE_PROJECT_ROOT/$arg" ;;
    *)   abs_path="$CLAUDE_PROJECT_ROOT/docs/specs/$slug.md" ;;
  esac
  if write_marker_atomic "$CONSENT_MARKER_SPEC" "$slug" "$NOW" "$abs_path"; then
    log_line consent_gate_grant "wrote spec_approval_grant slug=$slug path=$abs_path"
  else
    log_line consent_gate_grant "FAILED write spec_approval_grant slug=$slug"
  fi
elif [[ "$trimmed" =~ ^/approve-swarm[[:space:]]+([^[:space:]]+) ]]; then
  slug="$(canonical_slug "${BASH_REMATCH[1]}")"
  if write_marker_atomic "$CONSENT_MARKER_SWARM" "$slug" "$NOW"; then
    log_line consent_gate_grant "wrote swarm_approval_grant slug=$slug"
  else
    log_line consent_gate_grant "FAILED write swarm_approval_grant slug=$slug"
  fi
elif [[ "$trimmed" =~ ^/grant-commit([[:space:]].*)?$ ]]; then
  note="${BASH_REMATCH[1]:-}"
  note="${note#"${note%%[![:space:]]*}"}"
  if write_marker_atomic "$CONSENT_MARKER_COMMIT" "$NOW" "$note"; then
    log_line consent_gate_grant "wrote commit_consent_grant note=$note"
  else
    log_line consent_gate_grant "FAILED write commit_consent_grant"
  fi
fi

exit 0
