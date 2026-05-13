#!/usr/bin/env bash
# process_lifecycle_guard — PreToolUse / Bash
#
# Advisory hook. Detects process-management Bash patterns (kill, pkill, lsof,
# fuser, dev-server spawns) and surfaces relevant memory entries inline so
# Claude reads them at the moment of action rather than relying on
# session-start salience to persist across turns.
#
# Closes the gap diagnosed 2026-04-30: phase skills pull memory just-in-time
# via their `read on demand` contract, but ad-hoc main-context Bash has no
# skill firing — so no entry was ever read at the action point. This hook
# fires the read structurally.
#
# Output: prints the matched memory entries to stderr (Claude Code surfaces
# stderr in the tool transcript). Always emits `allow` — never blocks.
# Cross-references CLAUDE.md Article IX clauses 6 + 7.

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

CMD="$(payload_get .tool_input.command)"

# Empty commands or non-Bash payloads — nothing to inspect.
[ -n "$CMD" ] || { emit_allow; }

# Trigger detection. Patterns chosen to match the dev-server-ownership and
# lsof-port-kill-takes-firefox-with-it surfaces. Case-sensitive on the binary
# name; lower-case is canonical for these tools.
should_surface=0
case "$CMD" in
  *"kill "*|*"kill\""*|*"kill$"*|kill" "*|*" kill "*) should_surface=1 ;;
  *"pkill "*|*" pkill "*|pkill" "*) should_surface=1 ;;
  *"killall "*|*" killall "*) should_surface=1 ;;
  *"lsof "*|*" lsof "*|lsof" "*) should_surface=1 ;;
  *"fuser "*|*" fuser "*) should_surface=1 ;;
  *"npm run "*"serve"*|*"npm run "*"dev"*) should_surface=1 ;;
  *"yarn dev"*|*"pnpm dev"*) should_surface=1 ;;
  *"eleventy --serve"*|*"eleventy serve"*) should_surface=1 ;;
  *"vite"*|*"next dev"*|*"astro dev"*|*"http.server"*) should_surface=1 ;;
esac

[ "$should_surface" = 1 ] || { emit_allow; }

# Surface the relevant memory entries. The body of each entry (verbatim block
# first, structured fields after) is read directly so Claude sees the user's
# actual words, not Claude's prior paraphrase.
MEM="$CLAUDE_DOTDIR/memory"

excerpts="$(MEM="$MEM" python3 <<'PY'
import os, pathlib, re, sys
mem = pathlib.Path(os.environ["MEM"])
targets = [
    ("conventions.md", "dev-server-ownership"),
    ("landmines.md",   "lsof-port-kill-takes-firefox-with-it"),
]
chunks = []
for fname, anchor in targets:
    p = mem / fname
    if not p.exists():
        continue
    text = p.read_text()
    # Capture from "## <anchor>" up to the next "## " (or EOF).
    m = re.search(
        rf"^##\s+{re.escape(anchor)}\b.*?(?=^##\s|\Z)",
        text, re.M | re.S
    )
    if m:
        chunks.append(f"--- {fname} ---\n{m.group(0).rstrip()}")
print("\n\n".join(chunks))
PY
)"

if [ -z "$excerpts" ]; then
  # No matching memory entries on disk — emit a softer notice so the absence
  # is itself surfaced. Curator should re-flush memory if this fires.
  emit_info "process_lifecycle_guard: command matched a process-management pattern, but no memory entries (\`conventions.md → dev-server-ownership\`, \`landmines.md → lsof-port-kill-takes-firefox-with-it\`) were found. Consider \`/memory-flush\` or restoring the entries before proceeding."
  log_line "process_lifecycle_guard" "fired with empty memory: $CMD"
  emit_allow
fi

emit_info "process_lifecycle_guard — process-management memory surfaced (verbatim then interpretation):

$excerpts

This advisory fires whenever a Bash command matches a process-management pattern. CLAUDE.md Article IX clause 7: read the verbatim above, treat it as binding for the current operation, and prefer verbatim over interpretation when they conflict."

log_line "process_lifecycle_guard" "surfaced: ${CMD:0:120}"
emit_allow
