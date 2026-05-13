#!/usr/bin/env bash
# Git Commit Guard — PreToolUse(Bash) and PreToolUse(Write|Edit|MultiEdit)
#
# Two roles:
#
#   1. Bash matcher (run-boundary) — gates `git commit` invocations on a
#      fresh consent token at .claude/state/commit_consent (default TTL 5
#      min). Hard-blocks forbidden git operations regardless of consent.
#
#   2. Write matcher (write-boundary) — gates Claude's writes to the consent
#      files themselves:
#        - .claude/state/.commit_consent_grant — the marker. Written only by
#          consent_gate_grant.sh (UserPromptSubmit) on /grant-commit.
#        - .claude/state/commit_consent — the consent token. Writable by
#          Claude only when a fresh marker is on disk (consumed on success).
#
# This makes gate C structurally symmetric with gates A and B.

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

TOOL="$(payload_get .tool_name)"
case "$TOOL" in
  Bash)
    : # fall through to run-boundary logic below
    ;;
  Write|Edit|MultiEdit)
    FILE="$(payload_get .tool_input.file_path)"
    [ -n "$FILE" ] || emit_allow
    rel="$(canonical_rel "$FILE")"
    [ -n "$rel" ] || emit_allow

    block_marker_self_write "$rel" "$CONSENT_MARKER_COMMIT_REL" "Git Commit Guard" "/grant-commit"

    case "$rel" in
      .claude/state/commit_consent)
        validate_consent_marker "$CONSENT_MARKER_COMMIT" "Git Commit Guard" "/grant-commit"
        emit_allow
        ;;
      *)
        emit_allow
        ;;
    esac
    ;;
  *)
    emit_allow
    ;;
esac

CMD="$(payload_get .tool_input.command)"
[ -n "$CMD" ] || emit_allow

case "$CMD" in
  *git\ *|git) ;;
  *) emit_allow ;;
esac

# Hard-blocks (apply always, consent cannot override).
FORBIDDEN_RE='(\bgit\s+push\b|\bgit\s+commit\b[^|&;]*--amend|--no-verify|--no-gpg-sign|\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-[a-zA-Z]*f\b|\bgit\s+checkout\s+--\s|\bgit\s+branch\s+-D\b|\bgit\s+config\b|\bgit\s+rebase\s+-i\b|\bgit\s+add\s+-i\b|\bgit\s+add\s+(-A|\.)\b)'
if python3 -c "import re,sys; sys.exit(0 if re.search(r'''$FORBIDDEN_RE''', sys.argv[1]) else 1)" "$CMD"; then
  log_line git_commit_guard "BLOCKED forbidden git op: $CMD"
  emit_block "Git Commit Guard: forbidden git operation detected. seed.md forbids git push / --amend / --no-verify / reset --hard / clean -f / checkout -- / branch -D / config / rebase -i / add -A|. unless the user explicitly names the operation. Ask the user to approve by stating the exact command."
fi

if ! python3 -c "import re,sys; sys.exit(0 if re.search(r'\bgit\s+commit\b', sys.argv[1]) else 1)" "$CMD"; then
  emit_allow
fi

CONSENT_FILE="$STATE_DIR/commit_consent"
COMMIT_TTL="$(project_get .consent.commit_ttl_seconds)"
[ -z "$COMMIT_TTL" ] && COMMIT_TTL=300

if [ ! -f "$CONSENT_FILE" ]; then
  log_line git_commit_guard "BLOCKED no consent file: $CMD"
  emit_block "Git Commit Guard: no consent granted. The user must run \`/grant-commit\` before a commit is allowed. Consent is valid for ${COMMIT_TTL}s."
fi

read -r granted_at < "$CONSENT_FILE" 2>/dev/null
now="$(date +%s)"
if ! [[ "$granted_at" =~ ^[0-9]+$ ]]; then
  log_line git_commit_guard "BLOCKED malformed consent file"
  emit_block "Git Commit Guard: consent file is malformed. Ask the user to re-run \`/grant-commit\`."
fi

age=$(( now - granted_at ))
if [ "$age" -gt "$COMMIT_TTL" ]; then
  log_line git_commit_guard "BLOCKED consent expired age=${age}s ttl=${COMMIT_TTL}s"
  emit_block "Git Commit Guard: consent expired (${age}s old, TTL ${COMMIT_TTL}s). Ask the user to re-run \`/grant-commit\`."
fi

log_line git_commit_guard "ALLOWED age=${age}s cmd=$CMD"
emit_allow
