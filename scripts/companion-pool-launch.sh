#!/bin/sh
# companion-pool-launch.sh — DEV-ONLY. Not shipped to consumers.
#
# Launches a sprint-pool (push-dispatch) session via the research-preview
# channels path. Channels are in research preview: custom channels are off the
# approved allowlist and need --dangerously-load-development-channels, and
# Team/Enterprise orgs must explicitly enable them. None of that can be assumed
# on a consumer install, so the SHIPPED peer path (.claude/skills/companion)
# polls sprint_status instead and needs no launcher at all.
#
# Lives under scripts/ (never copied into obj/template) precisely so a
# baseline-owned skill dir does not ship a --dangerously-* wrapper.
set -eu

channel="${SPRINT_POOL_CHANNEL:-lobby}"
claude_bin="${CLAUDE_BIN:-claude}"
role="lead"
peer_id="lead"

case "${1:-}" in
  "")
    ;;
  --peer)
    role="peer"
    if [ -n "${2:-}" ]; then
      peer_id="$2"
    else
      peer_id="peer-$(date +%s)-$$"   # autocreate: epoch+pid, satisfies isSafeId
    fi
    ;;
  *)
    echo "usage: launch.sh [--peer [<id>]]   (no args = lead)" >&2
    exit 2
    ;;
esac

case "$peer_id" in
  ""|*[!A-Za-z0-9_-]*)
    echo "error: peer id '$peer_id' is not a safe id ([A-Za-z0-9_-]+)" >&2
    exit 2
    ;;
esac

# Export so the launched process (and any rc-defined function) inherits the channel wiring.
# SPRINT_POOL_ACTIVE=1 is what tells the spawned sprint-pool MCP server to register this
# session as a peer and run the push loop (a plain session that only loads the server does
# neither).
export SPRINT_POOL_ACTIVE=1
export SPRINT_POOL_CHANNEL="$channel"
export SPRINT_POOL_ROLE="$role"
export SPRINT_POOL_PEER_ID="$peer_id"

# Broker rendezvous: a short socket path OUTSIDE any repo clone (under the XDG runtime
# dir / TMPDIR), so a lead and peers in separate clones reach the same broker. An
# explicit SPRINT_BROKER_SOCK is honored; otherwise compute the documented default.
export SPRINT_BROKER_SOCK="${SPRINT_BROKER_SOCK:-${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/sprint-broker-${channel}.sock}"

claude_args="--dangerously-skip-permissions --dangerously-load-development-channels server:sprint-pool"

# Fast path: a real executable on PATH (e.g. plain `claude`).
if command -v "$claude_bin" >/dev/null 2>&1; then
  # word-split claude_args intentionally (POSIX)
  # shellcheck disable=SC2086
  exec "$claude_bin" $claude_args
fi

# Not on PATH — likely a shell alias/function from your rc (e.g. a `cclaude` zsh function).
# Functions/aliases are not visible to a child process, so re-exec through an interactive
# instance of your shell, which sources the rc and defines them.
user_shell="${SHELL:-/bin/sh}"
exec "$user_shell" -ic "${claude_bin} ${claude_args}"
