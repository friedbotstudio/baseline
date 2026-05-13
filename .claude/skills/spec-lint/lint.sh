#!/usr/bin/env bash
# spec-lint — run the three diagram-spec checks against a saved spec.
# Usage: .claude/skills/spec-lint/lint.sh <slug>

set -u

if [ "${1:-}" = "" ]; then
  echo "usage: lint.sh <slug>" >&2
  exit 2
fi
SLUG="$1"

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
SPEC="$ROOT/docs/specs/$SLUG.md"
PROJECT_JSON="$ROOT/.claude/project.json"

if [ ! -f "$SPEC" ]; then
  echo "spec-lint: spec not found at $SPEC" >&2
  exit 2
fi

HAS_PLANTUML=0
command -v plantuml >/dev/null 2>&1 && HAS_PLANTUML=1

SPEC="$SPEC" PROJECT_JSON="$PROJECT_JSON" HAS_PLANTUML="$HAS_PLANTUML" SLUG="$SLUG" python3 <<'PY'
import json, os, re, subprocess, sys

spec_path = os.environ["SPEC"]
pj_path   = os.environ["PROJECT_JSON"]
has_puml  = os.environ.get("HAS_PLANTUML") == "1"
spec = open(spec_path, encoding="utf-8").read()

fence_re = re.compile(r'^[ \t]*```[ \t]*plantuml[ \t]*$(.*?)^[ \t]*```[ \t]*$',
                      re.DOTALL | re.IGNORECASE | re.MULTILINE)
blocks = [m.group(1) for m in fence_re.finditer(spec)]

def check_syntax():
    if not has_puml:
        return "SKIP", "plantuml CLI not on PATH"
    if not blocks:
        return "PASS", "no blocks"
    bad = []
    for i, body in enumerate(blocks, start=1):
        src = body.strip("\n")
        if "@startuml" not in src:
            src = "@startuml\n" + src + "\n@enduml\n"
        try:
            r = subprocess.run(["plantuml", "-checkonly", "-pipe"],
                               input=src.encode(), capture_output=True, timeout=15)
        except Exception as e:
            bad.append(f"block #{i}: {e}")
            continue
        if r.returncode != 0:
            err = (r.stderr or r.stdout or b"").decode(errors="replace").strip().splitlines()
            bad.append(f"block #{i}: {' | '.join(err[-2:]) if err else 'exit ' + str(r.returncode)}")
    return ("PASS", "all blocks parse") if not bad else ("FAIL", "; ".join(bad))

def check_presence():
    try:
        pj = json.load(open(pj_path))
        required = pj["artifacts"]["required_diagrams"]["spec"]
    except Exception:
        return "SKIP", "required_diagrams.spec not configured"
    missing = []
    for kind, rule in required.items():
        need = int(rule.get("min", 1))
        marker = rule.get("marker")
        any_of = rule.get("any_of") or []
        found = 0
        for b in blocks:
            if marker and marker in b:
                found += 1; continue
            for pat in any_of:
                try:
                    if re.search(pat, b, re.MULTILINE):
                        found += 1; break
                except re.error:
                    continue
        if found < need:
            missing.append(f"{kind} (need {need}, found {found})")
    return ("PASS", "all kinds present") if not missing else ("FAIL", "missing: " + ", ".join(missing))

def check_traceability():
    # Find AC rows: table cells starting with AC-NNN in the Acceptance criteria section.
    ac_section_re = re.compile(r'##\s+Acceptance criteria(.*?)(?=^##\s|\Z)', re.DOTALL | re.MULTILINE)
    m = ac_section_re.search(spec)
    if not m:
        return "FAIL", "no '## Acceptance criteria' section"
    section = m.group(1)
    # Rows like: | AC-001 | ... | ... | §Behavior #1 |
    row_re = re.compile(r'\|\s*(AC-\d+)\s*\|.*?\|\s*(§?Behavior\s*#?\s*\d+|§Behavior\s*#\d+|—|-)\s*\|', re.IGNORECASE)
    rows = row_re.findall(section)
    if not rows:
        return "FAIL", "no AC-NNN rows with a sequence reference"
    problems = []
    # Extract which Behavior #N sequences actually exist: look for '### Behavior ...' or 'Behavior #N' titles and fenced sequence blocks.
    behavior_titles = set()
    # Accept anchors stamped inside sequence titles like `title Behavior #1 — ...`
    for i, b in enumerate(blocks, start=1):
        tm = re.search(r'(?im)^\s*title\s+Behavior\s*#(\d+)\b', b)
        if tm:
            behavior_titles.add(int(tm.group(1)))
    # Also consider explicit ### headings like "### Behavior #N" (optional extra convention).
    for hm in re.finditer(r'(?im)^###\s+Behavior\s*#(\d+)\b', spec):
        behavior_titles.add(int(hm.group(1)))

    for ac_id, ref in rows:
        if ref.strip() in ("—", "-"):
            problems.append(f"{ac_id}: no sequence reference")
            continue
        num_m = re.search(r'#\s*(\d+)', ref)
        if not num_m:
            problems.append(f"{ac_id}: unparsable ref '{ref.strip()}'")
            continue
        n = int(num_m.group(1))
        if n not in behavior_titles:
            problems.append(f"{ac_id}: §Behavior #{n} not found")
    return ("PASS", f"{len(rows)} AC rows all traced") if not problems else ("FAIL", "; ".join(problems))

def _expand_brace_globs(globs):
    # Expand {a,b,c} alternations into multiple flat globs so fnmatch can handle them.
    out = []
    for g in globs:
        if "{" not in g:
            out.append(g); continue
        # one level of brace expansion is enough for our patterns
        i = g.index("{"); j = g.index("}", i)
        prefix, alts, suffix = g[:i], g[i+1:j].split(","), g[j+1:]
        for a in alts:
            out.append(prefix + a.strip() + suffix)
    return out

def _glob_to_regex(g):
    # Convert a shell-style glob to a regex anchored at full-string match.
    # Handles `**` (any path segments incl. /), `*` (any chars except /),
    # and `?` (one char). Everything else is escaped.
    out = []
    i = 0
    while i < len(g):
        c = g[i]
        if c == "*":
            if i + 1 < len(g) and g[i+1] == "*":
                out.append(".*"); i += 2
            else:
                out.append("[^/]*"); i += 1
        elif c == "?":
            out.append("[^/]"); i += 1
        elif c in ".+()|^$\\[]{}":
            out.append(re.escape(c)); i += 1
        else:
            out.append(c); i += 1
    return "^" + "".join(out) + "$"

def _matches_any_glob(path, globs):
    for g in _expand_brace_globs(globs):
        if re.fullmatch(_glob_to_regex(g), path):
            return True
    return False

def check_design_calls():
    try:
        pj = json.load(open(pj_path))
        ui_globs = pj.get("tdd", {}).get("ui_globs", []) or []
    except Exception:
        return "SKIP", "tdd.ui_globs not configured"
    if not ui_globs:
        return "SKIP", "tdd.ui_globs is empty"

    # Extract write_set paths from the spec body. Accept either a leading
    # `write_set:` line (markdown body) or paths inside a Design calls table.
    write_set_paths = set()
    for line in spec.splitlines():
        m = re.search(r'write[_\s]set\s*:\s*(.+)$', line, re.IGNORECASE)
        if m:
            for tok in re.split(r'[`,\s|]+', m.group(1)):
                tok = tok.strip().strip("*").strip()
                if tok and "/" in tok and not tok.startswith("#"):
                    write_set_paths.add(tok)

    # Compute intersection of write_set with ui_globs.
    ui_hits = [p for p in write_set_paths if _matches_any_glob(p, ui_globs)]
    if not ui_hits:
        return "SKIP", f"no UI files in write_set ({len(write_set_paths)} paths checked)"

    # Conditional fires — design_calls section must be present AND non-empty.
    dc_section = re.search(
        r'^##\s+Design\s+calls\s*$([\s\S]*?)(?=^##\s|\Z)',
        spec, re.MULTILINE | re.IGNORECASE,
    )
    if not dc_section:
        return "FAIL", f"write_set has UI files ({', '.join(sorted(ui_hits))}) but no `## Design calls` section"
    body = dc_section.group(1).strip()
    # Empty conventions: `*(none)*`, dash placeholders, or no table rows.
    has_table_row = bool(re.search(r'^\|[^|\n]+\|[^|\n]+\|', body, re.MULTILINE))
    is_none_marker = bool(re.search(r'^\s*-?\s*\*?\(?none\)?\*?\s*$', body, re.MULTILINE | re.IGNORECASE))
    if not has_table_row or is_none_marker:
        return "FAIL", f"write_set has UI files ({', '.join(sorted(ui_hits))}) but Design calls section is empty / `*(none)*`"
    return "PASS", f"{len(ui_hits)} UI path(s) match design_calls rows"

results = [
    ("plantuml_syntax",   *check_syntax()),
    ("diagram_presence",  *check_presence()),
    ("ac_traceability",   *check_traceability()),
    ("design_calls",      *check_design_calls()),
]

name_w = max(len(n) for n, _, _ in results)
print(f"{'check'.ljust(name_w)}  {'status':<6}  detail")
print(f"{'-'*name_w}  {'-'*6}  {'-'*50}")
overall_fail = False
for name, status, detail in results:
    if status == "FAIL":
        overall_fail = True
    print(f"{name.ljust(name_w)}  {status:<6}  {detail}")
print(f"{'-'*name_w}  {'-'*6}")
print(f"{'overall'.ljust(name_w)}  {'FAIL' if overall_fail else 'PASS'}")
sys.exit(1 if overall_fail else 0)
PY
