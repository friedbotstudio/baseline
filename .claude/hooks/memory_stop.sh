#!/usr/bin/env bash
# Memory Stop — Stop event
#
# Fires once per assistant turn (end of a Claude response). Reads the
# transcript file (a JSONL where each line is one event), extracts patterns
# that look like memory candidates, and appends them to
# .claude/memory/_pending.md for later curation via /memory-flush.
#
# This hook is a PASSIVE COLLECTOR. It never writes to canonical memory
# files — only to the gitignored body of _pending.md. Claude curates
# candidates in main context via /memory-flush.
#
# Patterns extracted:
#   - Edit/Write/MultiEdit on source files → landmark candidate
#   - context7 MCP queries (resolve-library-id / query-docs) → library candidate
#   - Bash 'rg'/'grep'/'git' searches over source dirs → potential landmark/landmine
#   - Tool calls that touched .claude/memory/* → no-op (don't candidate-extract on memory writes)

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

TRANSCRIPT="$(payload_get .transcript_path)"
[ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ] || exit 0

MEM_DIR="$CLAUDE_DOTDIR/memory"
PENDING="$MEM_DIR/_pending.md"
[ -f "$PENDING" ] || exit 0

# Extract candidates with python; never fail the hook (it's advisory).
TRANSCRIPT="$TRANSCRIPT" PENDING="$PENDING" python3 <<'PY' || true
import json, os, re, sys, time
from pathlib import Path
from datetime import datetime, timezone

transcript = Path(os.environ['TRANSCRIPT'])
pending = Path(os.environ['PENDING'])

# Load existing pending body to avoid re-emitting duplicates within the session.
existing = pending.read_text(encoding='utf-8', errors='replace')
existing_keys = set(re.findall(r'(?m)^##\s+CANDIDATE:\s*(\S+)', existing))

candidates = []  # (key, category, body_lines)

# Source-dir prefixes that are interesting for landmark candidates.
SRC_PREFIXES = ('src/', 'lib/', 'app/', 'pkg/', 'internal/', 'cmd/', '.claude/hooks/', '.claude/skills/')
SKIP_PREFIXES = ('.claude/memory/', '.claude/state/', 'docs/scout/', 'docs/research/', 'docs/intake/',
                 'docs/specs/', 'docs/brd/', 'docs/rca/', 'docs/security/', 'docs/archive/')

def is_source(path: str) -> bool:
    if not isinstance(path, str) or not path:
        return False
    if any(path.startswith(p) for p in SKIP_PREFIXES):
        return False
    if any(path.startswith(p) for p in SRC_PREFIXES):
        return True
    return False

# Track per-path edit counts so we only candidate paths touched ≥1 time
# (loose threshold; the curator decides what's worth keeping).
path_touches = {}  # path -> count
lib_queries = []  # list of dicts {library, topic}

# Walk the transcript JSONL.
try:
    with transcript.open('r', encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except Exception:
                continue
            # Most relevant: assistant tool_use blocks.
            msg = ev.get('message') or ev
            if not isinstance(msg, dict):
                continue
            content = msg.get('content')
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get('type') != 'tool_use':
                    continue
                name = block.get('name', '')
                inp = block.get('input') or {}
                # Edit/Write/MultiEdit
                if name in ('Edit', 'Write', 'MultiEdit'):
                    fp = inp.get('file_path', '')
                    # Strip leading project root prefix if present.
                    if fp:
                        path_touches[fp] = path_touches.get(fp, 0) + 1
                # context7 MCP query
                elif 'context7' in name:
                    lib = inp.get('libraryName') or inp.get('library_name') or inp.get('libraryID')
                    topic = inp.get('topic') or inp.get('query') or ''
                    if lib:
                        lib_queries.append({'library': str(lib), 'topic': str(topic)[:80]})
except Exception as e:
    sys.stderr.write(f'memory_stop: transcript walk failed: {e}\n')

# Build candidates.
ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%MZ')

# Landmark candidates from touched source files.
for fp, n in sorted(path_touches.items(), key=lambda kv: (-kv[1], kv[0])):
    # Convert absolute path to repo-relative if it begins with the repo root.
    rel = fp
    cwd = os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd()
    if fp.startswith(cwd + '/'):
        rel = fp[len(cwd) + 1:]
    if not is_source(rel):
        continue
    key = f'{rel} → landmarks.md'
    if key in existing_keys:
        continue
    body = [
        f'## CANDIDATE: {key}',
        f'- Touched in this session: {n} time{"s" if n != 1 else ""}',
        f'- Suggested role: <fill in from session context>',
        f'- Source: file written/edited at {ts}',
        '',
    ]
    candidates.append((key, 'landmarks', body))

# Library candidates from context7 queries.
seen_libs = set()
for q in lib_queries:
    lib = q['library']
    if lib in seen_libs:
        continue
    seen_libs.add(lib)
    key = f'{lib} → libraries.md'
    if key in existing_keys:
        continue
    body = [
        f'## CANDIDATE: {key}',
        f'- Library: {lib}',
        f'- Topics queried this session: {q["topic"] or "(no topic field)"}',
        f'- Source: context7 MCP query at {ts}',
        f'- Reminder: pin a version before promoting to canonical (lib@version is the stable key).',
        '',
    ]
    candidates.append((key, 'libraries', body))

# If nothing to add, exit cleanly.
if not candidates:
    sys.exit(0)

# Append a session-tagged block to pending.
prefix = f'\n\n<!-- session {ts} -->\n'
new_block = prefix + '\n'.join('\n'.join(b) for _, _, b in candidates)
with pending.open('a', encoding='utf-8') as f:
    f.write(new_block)

# Print a concise info note for the user.
total_pending = len(re.findall(r'(?m)^##\s+CANDIDATE\b', existing)) + len(candidates)
sys.stderr.write(
    f'memory_stop: appended {len(candidates)} candidate(s) to .claude/memory/_pending.md '
    f'(total pending: {total_pending}). Run /memory-flush to review.\n'
)
PY

log_line memory_stop "ran end-of-turn extraction"

# Refresh the continuity snapshot so even mid-session crashes / abrupt /clear
# leave a usable _resume.md. Best-effort; never fail the hook.
python3 "$CLAUDE_DOTDIR/hooks/lib/resume_writer.py" \
  "$TRANSCRIPT" "$CLAUDE_PROJECT_ROOT" "stop" 2>>"$LOG_DIR/memory_stop.log" || true

exit 0
