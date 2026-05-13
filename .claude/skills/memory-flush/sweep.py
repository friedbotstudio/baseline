#!/usr/bin/env python3
"""Deterministic Step 0 helper for /memory-flush.

Scans canonical memory files for closure fields and prose closure signals,
applies the matching action (auto-close / surface-and-confirm / stale-sweep),
and emits a JSON action report. Invoked by SKILL.md Step 0 and exercised by
the fixture tests at .claude/skills/memory-flush/tests/run.sh.

CLI:
  --mode {auto-close, prose-scan, stale-sweep}
  --memory-dir <path>

For interactive modes (prose-scan, stale-sweep), one reply per surfaced entry
is read from stdin. Empty stdin / EOF defaults to "keep".
"""
from __future__ import annotations
import argparse
import json
import re
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

# --- constants (Foundation) ---------------------------------------------------

CANONICAL_FILES = [
    'landmarks', 'libraries', 'decisions',
    'landmines', 'conventions', 'pending-questions',
]
PENDING_FILE = 'pending-questions'

STALE_COMMITS = 30
STALE_DAYS = 30

ISO_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')

PROSE_PATTERNS = [
    re.compile(r'^(\s*-\s*)?\*\*?Resolution\s+(path\s+taken|by|date)\b', re.I | re.M),
    re.compile(r'^Superseded\s+(by|at|on)\b', re.I | re.M),
    re.compile(r'^Resolved\s+(by|on|at)\b', re.I | re.M),
]

# --- Foundation: filesystem + entry parsing -----------------------------------

def file_path(memdir: Path, name: str) -> Path:
    return memdir / f'{name}.md'

def read_file(memdir: Path, name: str) -> str:
    p = file_path(memdir, name)
    return p.read_text(encoding='utf-8', errors='replace') if p.is_file() else ''

def write_file(memdir: Path, name: str, text: str) -> None:
    file_path(memdir, name).write_text(text, encoding='utf-8')

def split_entries(text: str):
    """Return [(key, block_text)] for each `## ` heading + body in the file."""
    body = text.split('---', 2)[-1] if text.startswith('---') else text
    parts = re.split(r'(?m)^(##\s+\S.*)$', body)
    entries = []
    for i in range(1, len(parts), 2):
        heading = parts[i]
        tail = parts[i + 1] if i + 1 < len(parts) else ''
        key = heading[2:].strip().split()[0] if heading[2:].strip() else ''
        entries.append((key, heading + tail))
    return entries

def read_field(block: str, name: str):
    pat = re.compile(rf'^\s*-\s*{re.escape(name)}\s*:\s*(.+?)\s*$', re.M | re.I)
    m = pat.search(block)
    return m.group(1) if m else None

def has_field(block: str, name: str) -> bool:
    return read_field(block, name) is not None

def valid_iso(s) -> bool:
    if not s or not ISO_DATE_RE.match(s):
        return False
    try:
        datetime.strptime(s, '%Y-%m-%d')
        return True
    except ValueError:
        return False

def delete_block(text: str, block: str) -> str:
    idx = text.find(block)
    if idx < 0:
        return text
    before = text[:idx].rstrip('\n')
    after = text[idx + len(block):].lstrip('\n')
    if before and after:
        return before + '\n\n' + after
    if before:
        return before + '\n'
    return after

def update_field(block: str, name: str, value: str) -> str:
    pat = re.compile(rf'(^\s*-\s*{re.escape(name)}\s*:\s*).+$', re.M | re.I)
    if pat.search(block):
        return pat.sub(lambda m: f'{m.group(1)}{value}', block, count=1)
    return _append_field(block, name, value)

def _append_field(block: str, name: str, value: str) -> str:
    lines = block.rstrip('\n').split('\n')
    insert_at = len(lines)
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip().startswith('-'):
            insert_at = i + 1
            break
    lines.insert(insert_at, f'- {name}: {value}')
    return '\n'.join(lines) + '\n'

# --- Foundation: git + dates --------------------------------------------------

def head_sha(root: Path) -> str:
    try:
        return subprocess.check_output(
            ['git', '-C', str(root), 'rev-parse', '--short', 'HEAD'],
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
    except Exception:
        return ''

def commit_distance(root: Path, stamp: str):
    try:
        d = subprocess.check_output(
            ['git', '-C', str(root), 'rev-list', '--count', f'{stamp}..HEAD'],
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
        return int(d) if d.isdigit() else None
    except Exception:
        return None

def days_since(iso: str):
    try:
        d = datetime.strptime(iso, '%Y-%m-%d').date()
        return (date.today() - d).days
    except Exception:
        return None

# --- Domain: closure semantics ------------------------------------------------

def closure_field_for(name: str) -> str:
    return 'resolved-at' if name == PENDING_FILE else 'superseded-at'

def invariant_field_for(name: str) -> str:
    return 'superseded-at' if name == PENDING_FILE else 'resolved-at'

def is_closed(block: str, name: str) -> bool:
    return has_field(block, closure_field_for(name))

def prose_matches(block: str) -> bool:
    return any(p.search(block) for p in PROSE_PATTERNS)

def is_stale(block: str, name: str, head: str, root: Path) -> bool:
    if is_closed(block, name):
        return False
    stamp = read_field(block, 'verified-at')
    if head and stamp and stamp != 'HEAD':
        dist = commit_distance(root, stamp)
        return dist is None or dist >= STALE_COMMITS
    if not head:
        touched = read_field(block, 'last-touched')
        days = days_since(touched) if touched else None
        return days is not None and days >= STALE_DAYS
    return False

# --- Domain: per-mode sweepers ------------------------------------------------

def mode_auto_close(memdir: Path) -> dict:
    report = {'closed': 0, 'malformed': [], 'invariant_violation': []}
    for name in CANONICAL_FILES:
        text = read_file(memdir, name)
        if not text:
            continue
        valid = closure_field_for(name)
        wrong = invariant_field_for(name)
        new_text = text
        for key, block in split_entries(text):
            if has_field(block, wrong):
                report['invariant_violation'].append(
                    {'file': f'{name}.md', 'key': key, 'field': wrong}
                )
                continue
            value = read_field(block, valid)
            if value is None:
                continue
            if valid_iso(value):
                new_text = delete_block(new_text, block)
                report['closed'] += 1
            else:
                report['malformed'].append(
                    {'file': f'{name}.md', 'key': key, 'value': value}
                )
        if new_text != text:
            write_file(memdir, name, new_text)
    return report

def _next_reply() -> str:
    line = sys.stdin.readline()
    return line.strip().lower() if line else ''

def mode_prose_scan(memdir: Path) -> dict:
    report = {'surfaced': 0, 'closed_by_confirm': 0, 'kept': 0, 'deferred': 0}
    for name in CANONICAL_FILES:
        text = read_file(memdir, name)
        if not text:
            continue
        new_text = text
        for key, block in split_entries(text):
            if is_closed(block, name):
                continue
            if not prose_matches(block):
                continue
            report['surfaced'] += 1
            reply = _next_reply()
            if reply == 'y':
                new_text = delete_block(new_text, block)
                report['closed_by_confirm'] += 1
            elif reply == 'skip':
                report['deferred'] += 1
            else:
                report['kept'] += 1
        if new_text != text:
            write_file(memdir, name, new_text)
    return report

def mode_stale_sweep(memdir: Path) -> dict:
    report = {'reverified': 0, 'deleted': 0, 'mark_closed': 0, 'kept': 0}
    root = memdir.parent.parent
    head = head_sha(root)
    today = date.today().isoformat()
    for name in CANONICAL_FILES:
        text = read_file(memdir, name)
        if not text:
            continue
        new_text = text
        for key, block in split_entries(text):
            if not is_stale(block, name, head, root):
                continue
            reply = _next_reply()
            new_text = _apply_stale_action(new_text, block, name, reply, head, today, report)
        if new_text != text:
            write_file(memdir, name, new_text)
    return report

def _apply_stale_action(text, block, name, reply, head, today, report):
    if reply == 're-verify':
        updated = update_field(block, 'verified-at', head or 'HEAD')
        updated = update_field(updated, 'last-touched', today)
        report['reverified'] += 1
        return text.replace(block, updated)
    if reply == 'delete':
        report['deleted'] += 1
        return delete_block(text, block)
    if reply == 'mark-closed':
        field = closure_field_for(name)
        updated = update_field(block, field, today)
        report['mark_closed'] += 1
        return text.replace(block, updated)
    report['kept'] += 1
    return text

# --- Orchestration ------------------------------------------------------------

MODE_DISPATCH = {
    'auto-close': mode_auto_close,
    'prose-scan': mode_prose_scan,
    'stale-sweep': mode_stale_sweep,
}

def parse_args(argv):
    p = argparse.ArgumentParser(description='Memory Step 0 sweep helper')
    p.add_argument('--mode', required=True, choices=list(MODE_DISPATCH))
    p.add_argument('--memory-dir', required=True)
    return p.parse_args(argv)

def main(argv) -> int:
    args = parse_args(argv)
    memdir = Path(args.memory_dir).resolve()
    report = MODE_DISPATCH[args.mode](memdir)
    print(json.dumps(report))
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
