#!/usr/bin/env bash
# Memory Session Start — SessionStart
#
# At every session start, scans .claude/memory/*.md and emits a compact index
# into Claude's startup context: per-file entry counts, stale-entry counts,
# and a pending-flush nag if _pending.md has unreviewed candidates.
#
# Output format: structured `additionalContext` JSON so Claude Code injects
# the index directly into the startup prompt. Output kept under ~2KB; the
# canonical files load on first relevant skill invocation.

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

# Marker cleanup — remove stale .harness_active from a prior session.
# Runs BEFORE the memory-dir check so cleanup happens regardless of memory state.
# Cross-session ghost prevention: the harness_continuation Stop hook reads this
# marker as Rung 2; without this cleanup, a leftover marker from a prior session
# would let yesterday's state: continue re-fire on today's first turn-end.
MARKER="$CLAUDE_DOTDIR/state/.harness_active"
if [ -f "$MARKER" ]; then
  MARKER_SLUG="$(head -1 "$MARKER" 2>/dev/null)"
  rm -f "$MARKER"
  mkdir -p "$LOG_DIR"
  printf '%s  INFO  removed stale .harness_active (slug=%s)\n' \
    "$(date -u +%FT%TZ)" "$MARKER_SLUG" >> "$LOG_DIR/harness_continuation.log"
fi

MEM_DIR="$CLAUDE_DOTDIR/memory"

# If the memory directory doesn't exist (fresh repo, pre-init), do nothing.
[ -d "$MEM_DIR" ] || exit 0

# How the session started — drives the framing line for the resume snapshot.
SESSION_SOURCE="$(payload_get .source)"
[ -n "$SESSION_SOURCE" ] || SESSION_SOURCE="startup"

context="$(MEM_DIR="$MEM_DIR" CLAUDE_PROJECT_ROOT="$CLAUDE_PROJECT_ROOT" SESSION_SOURCE="$SESSION_SOURCE" python3 <<'PY'
import json, os, re, subprocess
from datetime import date, datetime, timezone
from pathlib import Path

mem_dir = Path(os.environ['MEM_DIR'])
root = Path(os.environ['CLAUDE_PROJECT_ROOT'])

# Resolve the current HEAD; if not a git repo, leave HEAD blank (skill cite-then-verify still works).
try:
    head = subprocess.check_output(
        ['git', '-C', str(root), 'rev-parse', '--short', 'HEAD'],
        stderr=subprocess.DEVNULL, text=True,
    ).strip()
except Exception:
    head = ''

# Files in canonical order. _pending.md handled separately.
canonical = ['landmarks', 'libraries', 'decisions', 'landmines', 'conventions', 'pending-questions', 'backlog']
PENDING_FILE = 'pending-questions'
STALE_EXEMPT_FILES = {'backlog'}
STALE_COMMITS = 30
STALE_DAYS = 30  # non-git fallback threshold


def _field(block, name):
    m = re.search(rf'(?m)^\s*-\s*{re.escape(name)}\s*:\s*(.+?)\s*$', block, re.IGNORECASE)
    return m.group(1).strip() if m else None


def _commit_distance(stamp):
    try:
        d = subprocess.check_output(
            ['git', '-C', str(root), 'rev-list', '--count', f'{stamp}..HEAD'],
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
        return int(d) if d.isdigit() else None
    except Exception:
        return None


def _days_since(iso):
    try:
        d = datetime.strptime(iso, '%Y-%m-%d').date()
        return (date.today() - d).days
    except Exception:
        return None


def _split_blocks(body):
    parts = re.split(r'(?m)^(##\s+\S.*)$', body)
    out = []
    for i in range(1, len(parts), 2):
        heading = parts[i]
        tail = parts[i + 1] if i + 1 < len(parts) else ''
        key = heading[2:].strip().split()[0] if heading[2:].strip() else ''
        out.append((key, heading + tail))
    return out


def _is_stale(block, name):
    if name in STALE_EXEMPT_FILES:
        return False
    closure_field = 'resolved-at' if name == PENDING_FILE else 'superseded-at'
    if _field(block, closure_field):
        return False
    stamp = _field(block, 'verified-at')
    if head and stamp and stamp != 'HEAD':
        dist = _commit_distance(stamp)
        return dist is None or dist >= STALE_COMMITS
    if not head:
        days = _days_since(_field(block, 'last-touched') or '')
        return days is not None and days >= STALE_DAYS
    return False


rows = []
total_entries = 0
total_stale = 0
stale_records = []  # (file_name, key, last_touched) for the rendered block

for name in canonical:
    p = mem_dir / f'{name}.md'
    if not p.is_file():
        rows.append((name, 0, 0, 'missing'))
        continue
    text = p.read_text(encoding='utf-8', errors='replace')
    body = text.split('---', 2)[-1] if text.startswith('---') else text
    blocks = _split_blocks(body)
    n = len(blocks)
    total_entries += n
    stale = 0
    for key, blk in blocks:
        if not _is_stale(blk, name):
            continue
        stale += 1
        stale_records.append((name, key, _field(blk, 'last-touched') or ''))
    total_stale += stale
    rows.append((name, n, stale, 'ok'))

# Pending candidates: count `## CANDIDATE:` entries in _pending.md body.
pending_path = mem_dir / '_pending.md'
pending_count = 0
if pending_path.is_file():
    body = pending_path.read_text(encoding='utf-8', errors='replace').split('---', 2)[-1]
    pending_count = len(re.findall(r'(?m)^##\s+CANDIDATE\b', body))

# Compose the context block.
lines = [
    '## Project memory — index (.claude/memory/)',
    '',
    f'HEAD: `{head or "n/a"}`  ·  total entries: {total_entries}  ·  stale (>=30 commits old): {total_stale}',
    '',
    '| File | Entries | Stale | Status |',
    '|---|---:|---:|---|',
]
for name, n, stale, status in rows:
    lines.append(f'| `{name}.md` | {n} | {stale} | {status} |')
# Phase 10.6: surface the _pending.md row in the index so K=0 / K>0 are
# visible without the prose nag. The body content is gitignored; only the
# count matters here.
lines.append(f'| `_pending.md` | {pending_count} | — | ok |')

if stale_records:
    stale_records.sort(key=lambda r: (r[2] or '', f'{r[0]}:{r[1]}'))
    top = stale_records[:5]
    overflow = len(stale_records) - 5
    lines.append('')
    lines.append('## Stale entries')
    lines.append('')
    for fname, key, last in top:
        last_part = f' — last-touched {last}' if last else ''
        lines.append(f'- `{fname}.md` `{key}`{last_part}')
    if overflow > 0:
        lines.append(f'… and {overflow} more')

lines.append('')

# Phase 10.6 (memory-flush as workflow phase) downgraded the SessionStart nag to
# debt-mode only: fire when _pending.md has unflushed candidates AND no active
# workflow is on disk. During an active workflow, Phase 10.6 will handle them;
# the nag would be redundant. On K=0, stay silent — the index table above already
# shows the _pending.md row count.
workflow_json = root / '.claude/state/workflow.json'
active_workflow = workflow_json.is_file()

if pending_count > 0 and not active_workflow:
    plural = '' if pending_count == 1 else 's'
    lines.append(
        f'**{pending_count} pending memory candidate{plural} carried over from a prior workflow** — '
        'run `/memory-flush` to clear before starting new work.'
    )

# Pending upgrade stages (tier1-merge-option AC-004 + AC-008). Scans
# .claude/state/upgrade/*/manifest.json for entries with status: PENDING.
# Fires regardless of active_workflow (design pick 2C): stages are stable
# infrastructure debt, distinct from memory-candidate debt above.
upgrade_pending = 0
upgrade_root = root / '.claude/state/upgrade'
if upgrade_root.is_dir():
    for stage_manifest in upgrade_root.glob('*/manifest.json'):
        try:
            with open(stage_manifest) as f:
                stage = json.load(f)
        except Exception:
            continue
        for entry in stage.get('files', []):
            if entry.get('status') == 'PENDING':
                upgrade_pending += 1

if upgrade_pending > 0:
    noun = 'file' if upgrade_pending == 1 else 'files'
    lines.append(
        f'**{upgrade_pending} {noun} staged for /upgrade-project to reconcile** — '
        'run `/upgrade-project` when ready.'
    )

lines.append('')
lines.append(
    'Files are read on demand by the relevant skill (scout reads landmarks, research reads libraries, etc.). '
    'Every cited entry is re-verified before use; failed verifications are corrected or deleted in the same run. '
    'See `.claude/memory/README.md` for the entry shape and self-healing rules.'
)

out = '\n'.join(lines)
# Cap the index portion at ~2KB so the resume snapshot has room.
if len(out) > 2048:
    out = out[:2000] + '\n…(index truncated)'

# Resume snapshot — only injected when present and reasonably fresh.
# Source-aware framing tells the model why it's seeing this and what to do.
src = os.environ.get('SESSION_SOURCE', 'startup')
framings = {
    'compact':  '↻ Resuming after compaction. Last captured state below — pick up from here.',
    'clear':    '↻ Continuity from prior session. The user just `/clear`\'d; here is where things stood.',
    'resume':   '↻ Session resumed. Last captured state below.',
    'startup':  '↻ Prior session left this snapshot. If still relevant, pick up from here.',
}
framing = framings.get(src, framings['startup'])

resume_path = mem_dir / '_resume.md'
if resume_path.is_file():
    try:
        raw = resume_path.read_text(encoding='utf-8', errors='replace')
        # Skip frontmatter (between leading --- markers) — keep just the body.
        body = raw
        if raw.startswith('---'):
            parts = raw.split('---', 2)
            if len(parts) == 3:
                body = parts[2].lstrip('\n')
        # Freshness gate: only inject if file modified <= 7 days ago.
        mtime = datetime.fromtimestamp(resume_path.stat().st_mtime, tz=timezone.utc)
        age_days = (datetime.now(timezone.utc) - mtime).days
        if age_days <= 7 and body.strip():
            # Total cap ~9.5KB to stay well under the 10KB additionalContext limit.
            budget = 9500 - len(out) - len(framing) - 80
            if budget > 500:
                if len(body) > budget:
                    body = body[:budget].rstrip() + '\n\n…(snapshot truncated)'
                out = (
                    out
                    + '\n\n---\n\n'
                    + framing
                    + f' (snapshot age: {age_days}d)\n\n'
                    + body
                )
    except Exception:
        pass

print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'SessionStart',
        'additionalContext': out,
    },
}))
PY
)"

# If python emitted nothing (memory dir empty / parse failure), exit silently.
[ -n "$context" ] || exit 0

printf '%s\n' "$context"
log_line memory_session_start "emitted memory index"
exit 0
