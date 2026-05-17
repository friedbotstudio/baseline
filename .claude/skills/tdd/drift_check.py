#!/usr/bin/env python3
"""Spec-to-implementation drift analysis (Phase 6 worker step).

CLI:
  python3 drift_check.py --slug <slug> [--project-root <path>] [--diff <path>]

Reads `docs/specs/<slug>.md` from `--project-root`, scores every numbered AC
in the ## Acceptance criteria table and every row of the ## Design calls
table against the implementation diff (--diff override, else `git diff
<merge-base>..HEAD` against the main branch). Writes a markdown report at
`<project-root>/.claude/state/drift/<slug>.md` with a per-item verdict of
`resolved | unresolved | unknown` plus evidence.

Exit codes:
  0  zero unresolved (`resolved` and `unknown` items are advisory)
  1  >=1 unresolved
  2  tool error (handled by argparse / unhandled exception)

Special case: spec file missing at the named slug → print "no spec; skipped"
to stdout, exit 0, no report file written (supports chore-track workflows).
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# --- Foundation: regex + IO --------------------------------------------------

AC_ROW_RE = re.compile(r'^\|\s*(AC-\d+)\s*\|', re.MULTILINE)
DESIGN_CALLS_SECTION_RE = re.compile(
    r'^##\s+Design calls\s*\n(.*?)(?=^##\s|\Z)',
    re.MULTILINE | re.DOTALL,
)
DESIGN_ROW_RE = re.compile(r'^\|\s*([^|]+?)\s*\|', re.MULTILINE)
NONE_BODY_RE = re.compile(r'^[\s\-]*\*?\(?none\)?\*?[\s\-]*$', re.IGNORECASE)


def load_spec(project_root: Path, slug: str) -> str | None:
    spec_path = project_root / 'docs' / 'specs' / f'{slug}.md'
    if not spec_path.is_file():
        return None
    return spec_path.read_text(encoding='utf-8', errors='replace')


def load_diff(project_root: Path, diff_path: Path | None) -> str:
    if diff_path:
        return diff_path.read_text(encoding='utf-8', errors='replace')
    try:
        merge_base = subprocess.check_output(
            ['git', '-C', str(project_root), 'merge-base', 'HEAD', 'main'],
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
        return subprocess.check_output(
            ['git', '-C', str(project_root), 'diff', f'{merge_base}..HEAD'],
            stderr=subprocess.DEVNULL, text=True,
        )
    except Exception:
        return ''


def write_report(project_root: Path, slug: str, body: str) -> Path:
    out_dir = project_root / '.claude' / 'state' / 'drift'
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f'{slug}.md'
    out_path.write_text(body, encoding='utf-8')
    return out_path


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def added_lines(diff_text: str) -> list[str]:
    return [ln for ln in diff_text.splitlines()
            if ln.startswith('+') and not ln.startswith('+++')]


# --- Domain: parse + score ---------------------------------------------------

def parse_acs(spec_text: str) -> list[str]:
    return AC_ROW_RE.findall(spec_text)


def parse_design_calls(spec_text: str) -> list[str]:
    """Return the list of row-slugs in the spec's `## Design calls` table.
    Empty list iff section absent or body is the *(none)* sentinel."""
    m = DESIGN_CALLS_SECTION_RE.search(spec_text)
    if not m:
        return []
    body = m.group(1).strip()
    if NONE_BODY_RE.match(body) or '*(none)*' in body or '(none)' in body.lower():
        return []
    rows = []
    for row_match in DESIGN_ROW_RE.finditer(body):
        first_cell = row_match.group(1).strip()
        if re.match(r'^[\s:|\-]+$', first_cell):
            continue
        if first_cell.lower() in ('slug', 'kind'):
            continue
        rows.append(first_cell)
    return rows


def score_against_diff(item_id: str, diff_added: list[str]) -> tuple[str, str]:
    for ln in diff_added:
        if item_id in ln:
            snippet = ln.strip()
            if len(snippet) > 120:
                snippet = snippet[:117] + '...'
            return ('resolved', f'found in diff: {snippet}')
    return ('unresolved', 'no diff added-line references this item')


def render_report(slug: str,
                  acs: list[tuple[str, str, str]],
                  design_rows: list[tuple[str, str, str]]) -> str:
    lines = [
        f'# Drift report — {slug}',
        '',
        f'Generated at: {now_iso()}',
        '',
        '## Acceptance criteria',
        '',
        '| kind | id | verdict | evidence |',
        '|---|---|---|---|',
    ]
    for ac_id, verdict, evidence in acs:
        lines.append(f'| ac | {ac_id} | {verdict} | {evidence} |')
    lines.append('')
    lines.append('## Design calls')
    lines.append('')
    if not design_rows:
        lines.append('no design calls — skipped')
    else:
        lines.append('| kind | id | verdict | evidence |')
        lines.append('|---|---|---|---|')
        for row_slug, verdict, evidence in design_rows:
            lines.append(f'| design-call | {row_slug} | {verdict} | {evidence} |')
    lines.append('')
    return '\n'.join(lines)


# --- Orchestration -----------------------------------------------------------

def main(argv) -> int:
    parser = argparse.ArgumentParser(description='Spec-to-implementation drift analysis')
    parser.add_argument('--slug', required=True)
    parser.add_argument('--project-root', default='.')
    parser.add_argument('--diff', default=None)
    args = parser.parse_args(argv)

    project_root = Path(args.project_root).resolve()
    spec_text = load_spec(project_root, args.slug)
    if spec_text is None:
        print('no spec; skipped')
        return 0

    diff_path = Path(args.diff).resolve() if args.diff else None
    diff_text = load_diff(project_root, diff_path)
    diff_added = added_lines(diff_text)

    ac_results = [(ac_id, *score_against_diff(ac_id, diff_added))
                  for ac_id in parse_acs(spec_text)]

    design_results = [(slug_, *score_against_diff(slug_, diff_added))
                      for slug_ in parse_design_calls(spec_text)]

    report = render_report(args.slug, ac_results, design_results)
    write_report(project_root, args.slug, report)

    unresolved = sum(1 for _, v, _ in ac_results if v == 'unresolved')
    unresolved += sum(1 for _, v, _ in design_results if v == 'unresolved')
    return 0 if unresolved == 0 else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
