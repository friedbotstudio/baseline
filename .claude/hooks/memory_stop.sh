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
import hashlib, json, os, re, sys, time
from pathlib import Path
from datetime import datetime, timezone

transcript = Path(os.environ['TRANSCRIPT'])
pending = Path(os.environ['PENDING'])

# Load existing pending body to avoid re-emitting duplicates within the session.
existing = pending.read_text(encoding='utf-8', errors='replace')
existing_keys = set(re.findall(r'(?m)^##\s+CANDIDATE:\s*(\S+)', existing))

candidates = []  # (key, category, body_lines)

# --- Source-dir prefixes that are interesting for landmark candidates. -------
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

# --- Intent-extraction constants + helpers (backlog candidates). -------------
# Anchored line-start patterns. USER patterns accept an optional Markdown
# bullet prefix; ASSISTANT patterns require strict line-start to suppress
# Claude's natural tendency to write narrative summaries containing trigger
# phrases. Precision-favoring per the user constraint; mid-sentence matches
# MUST NOT fire.
_USER_BULLET = r'^(?:\s*[-*]\s*)?'
_ASSISTANT_BULLET = r'^'
_INTENT_TRIGGERS = [
    r'TODO[:\s]',
    r'next\s+we\s+(?:should|need\s+to|must)\b',
    r"let'?s\s+also\b",
    r'we\s+should\s+also\b',
    r'backlog\s+this\b',
    r'after\s+this(?:\s+lands)?\b',
]
USER_INTENT_PATTERNS = [re.compile(_USER_BULLET + t, re.I) for t in _INTENT_TRIGGERS]
ASSISTANT_INTENT_PATTERNS = [re.compile(_ASSISTANT_BULLET + t, re.I) for t in _INTENT_TRIGGERS]

# Stripped from the matched line before slug derivation so the slug captures
# the *intent payload*, not the trigger phrase.
TRIGGER_STRIP = re.compile(
    r"^(?:\s*[-*]\s*)?"
    r"(?:TODO[:\s]+"
    r"|next\s+we\s+(?:should|need\s+to|must)\s+"
    r"|let'?s\s+also\s+"
    r"|we\s+should\s+also\s+"
    r"|backlog\s+this[:\s]*"
    r"|after\s+this(?:\s+lands)?[\s,]*)",
    re.I,
)

NOISE_PREFIXES = ('<system-reminder>', '<command-name>', '<local-command-')
MAX_INTENT_TEXT_LEN = 240


def _extract_text_blocks(content):
    """Walk a message content list and return trimmed text-block strings.
    Mirrors lib/resume_writer.py:72-88."""
    out = []
    if isinstance(content, str):
        if content.strip():
            out.append(content.strip())
        return out
    if not isinstance(content, list):
        return out
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get('type') == 'text':
            t = block.get('text', '')
            if isinstance(t, str) and t.strip():
                out.append(t.strip())
    return out


def _filter_noise(text: str) -> bool:
    """True when the text is hook-injected noise that must not produce candidates."""
    head = text.lstrip()[:64]
    return any(head.startswith(p) for p in NOISE_PREFIXES)


def _iter_intent_matches(text: str, patterns):
    """Yield each line of `text` whose start matches any of `patterns`."""
    for line in text.splitlines():
        for pat in patterns:
            if pat.match(line):
                yield line
                break


def _normalize_intent(line: str) -> str:
    """Lowercase, whitespace-collapse, trigger-strip. Empty result = discard."""
    stripped = TRIGGER_STRIP.sub('', line).strip()
    if not stripped:
        return ''
    return re.sub(r'\s+', ' ', stripped).lower()


def _slug_words(normalized: str, max_words: int = 8) -> str:
    """Kebab-case slug from the first `max_words` ASCII-alphanumeric words."""
    words = re.findall(r'[a-z0-9]+', normalized)
    if not words:
        return ''
    return '-'.join(words[:max_words])


def _derive_key(line: str):
    """Return (key, normalized) where key = `<slug>-<4-char-sha256>` or
    (None, '') if the line has no extractable intent payload."""
    normalized = _normalize_intent(line)
    if not normalized:
        return None, ''
    slug = _slug_words(normalized)
    if not slug:
        return None, ''
    hsh = hashlib.sha256(normalized.encode('utf-8')).hexdigest()[:4]
    return f'{slug}-{hsh}', normalized


# Track per-path edit counts so we only candidate paths touched ≥1 time
# (loose threshold; the curator decides what's worth keeping).
path_touches = {}  # path -> count
lib_queries = []  # list of dicts {library, topic}
intent_candidates = []  # list of dicts {key, verbatim, role, source}
seen_intent_keys = set()  # within-session dedup keyed on f'{key}::{source}'

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
            # tool_use blocks → landmark / library candidates.
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

            # text blocks → backlog (intent) candidates. Errors here MUST NOT
            # crash the hook — preserve the never-fail contract.
            try:
                role = msg.get('role') or (ev.get('role') if isinstance(ev, dict) else None)
                if role in ('user', 'assistant'):
                    patterns = USER_INTENT_PATTERNS if role == 'user' else ASSISTANT_INTENT_PATTERNS
                    source_value = 'user-instruction' if role == 'user' else 'assistant-deferral'
                    for text in _extract_text_blocks(content):
                        if _filter_noise(text):
                            continue
                        for matched_line in _iter_intent_matches(text, patterns):
                            key, normalized = _derive_key(matched_line)
                            if not key:
                                continue
                            dedup_key = f'{key}::{source_value}'
                            if dedup_key in seen_intent_keys:
                                continue
                            seen_intent_keys.add(dedup_key)
                            verbatim = matched_line.strip()
                            if len(verbatim) > MAX_INTENT_TEXT_LEN:
                                verbatim = verbatim[:MAX_INTENT_TEXT_LEN].rstrip() + '…'
                            intent_candidates.append({
                                'key': key,
                                'verbatim': verbatim,
                                'role': role,
                                'source': source_value,
                            })
            except Exception as e:
                sys.stderr.write(f'memory_stop: intent extraction failed for one event: {e}\n')
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

# Backlog (intent) candidates from user/assistant text blocks.
workflow_slug = ''
try:
    wf_path = Path(os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd()) / '.claude/state/workflow.json'
    if wf_path.is_file():
        wf = json.loads(wf_path.read_text(encoding='utf-8'))
        workflow_slug = wf.get('slug') or ''
except Exception:
    workflow_slug = ''

for cand in intent_candidates:
    key = cand['key']
    full_key = f'backlog → {key}'
    if full_key in existing_keys:
        continue
    body = [
        f'## CANDIDATE: backlog → {key}',
        f'- Intent: {cand["verbatim"]}',
        f'- Role: {cand["role"]}',
        f'- Source: {cand["source"]}',
        f'- Context: {workflow_slug or "(no active workflow)"}',
        f'- Emitted-at: {ts}',
        '',
    ]
    candidates.append((full_key, 'backlog', body))

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
