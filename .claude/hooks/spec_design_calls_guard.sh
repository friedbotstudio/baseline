#!/usr/bin/env bash
# Spec Design Calls Guard — PreToolUse(Write|Edit|MultiEdit)
#
# When a spec's write_set intersects `project.json → tdd.ui_globs`, the spec
# MUST declare a `## Design calls` section with at least one populated row.
# This hook denies writes to docs/specs/*.md that violate the rule.
#
# The rule is structurally tied to CLAUDE.md Article X.2: every UI design
# task in a workflow phase routes through `design-ui`. /tdd Step 6 reads the
# spec's design_calls rows and invokes design-ui per row. Without those
# rows, the design lane is silently skipped — the rule prevents that.
#
# Conditional firing:
#   - SKIP (allow): `tdd.ui_globs` empty or missing.
#   - SKIP (allow): write_set ∩ ui_globs is empty (no UI files in the spec).
#   - DENY: write_set has UI files AND no `## Design calls` section / empty body.
#   - ALLOW: write_set has UI files AND `## Design calls` has a populated row.
#
# Template files (_TEMPLATE_*) are exempt — they declare the section shape.

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

TOOL="$(payload_get .tool_name)"
case "$TOOL" in
  Write|Edit|MultiEdit) ;;
  *) emit_allow ;;
esac

FILE="$(payload_get .tool_input.file_path)"
[ -n "$FILE" ] || emit_allow
rel="${FILE#$CLAUDE_PROJECT_ROOT/}"

case "$rel" in
  docs/specs/*.md) ;;
  *) emit_allow ;;
esac

base="${rel##*/}"
case "$base" in
  _TEMPLATE_*|*TEMPLATE*.md) emit_allow ;;
esac

ui_globs_json="$(project_get .tdd.ui_globs)"
if [ -z "$ui_globs_json" ] || [ "$ui_globs_json" = "None" ] || [ "$ui_globs_json" = "[]" ]; then
  emit_allow
fi

HOOK_FILE="$FILE" HOOK_TOOL="$TOOL" HOOK_REL="$rel" HOOK_UI_GLOBS="$ui_globs_json" python3 <<'PY'
import json, os, pathlib, re, sys

payload = json.loads(os.environ.get("HOOK_PAYLOAD", "") or "{}")
tool    = os.environ["HOOK_TOOL"]
file_   = os.environ["HOOK_FILE"]
rel     = os.environ["HOOK_REL"]
try:
    ui_globs = json.loads(os.environ["HOOK_UI_GLOBS"])
except Exception:
    sys.exit(0)
if not isinstance(ui_globs, list) or not ui_globs:
    sys.exit(0)

ti = payload.get("tool_input") or {}

def current():
    try:
        return pathlib.Path(file_).read_text(encoding="utf-8")
    except Exception:
        return ""

if tool == "Write":
    content = ti.get("content") or ""
elif tool == "Edit":
    base = current()
    old = ti.get("old_string") or ""
    new = ti.get("new_string") or ""
    if ti.get("replace_all"):
        content = base.replace(old, new)
    else:
        content = base.replace(old, new, 1) if old in base else (base + new)
elif tool == "MultiEdit":
    content = current()
    for edit in (ti.get("edits") or []):
        old = edit.get("old_string") or ""
        new = edit.get("new_string") or ""
        if edit.get("replace_all"):
            content = content.replace(old, new)
        else:
            content = content.replace(old, new, 1) if old in content else (content + new)
else:
    sys.exit(0)

if not content.strip():
    sys.exit(0)

def expand_brace_globs(globs):
    out = []
    for g in globs:
        if "{" not in g:
            out.append(g); continue
        i = g.index("{"); j = g.index("}", i)
        prefix, alts, suffix = g[:i], g[i+1:j].split(","), g[j+1:]
        for a in alts:
            out.append(prefix + a.strip() + suffix)
    return out

def glob_to_regex(g):
    out, i = [], 0
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

def matches_any_glob(path, globs):
    for g in expand_brace_globs(globs):
        if re.fullmatch(glob_to_regex(g), path):
            return True
    return False

# Extract write_set paths from the spec body. Accept a leading "write_set:"
# line or paths inside a `## Design calls` table.
write_set_paths = set()
for line in content.splitlines():
    m = re.search(r'write[_\s]set\s*:\s*(.+)$', line, re.IGNORECASE)
    if m:
        for tok in re.split(r'[`,\s|]+', m.group(1)):
            tok = tok.strip().strip("*").strip()
            if tok and "/" in tok and not tok.startswith("#"):
                write_set_paths.add(tok)

ui_hits = [p for p in write_set_paths if matches_any_glob(p, ui_globs)]
if not ui_hits:
    sys.exit(0)

# Find the `## Design calls` section and verify it has a populated row.
dc_section = re.search(
    r'^##\s+Design\s+calls\s*$([\s\S]*?)(?=^##\s|\Z)',
    content, re.MULTILINE | re.IGNORECASE,
)
body = dc_section.group(1).strip() if dc_section else ""

def is_populated(body):
    # A populated body has at least one table row that isn't the header / separator.
    # A row like `| --- | --- | ... |` is the separator (not a real row).
    rows = [
        ln for ln in body.splitlines()
        if re.match(r'^\s*\|', ln) and not re.match(r'^\s*\|[\s:-]+\|', ln)
    ]
    if len(rows) < 2:
        return False
    # The first row is the column header; the rest are data rows.
    return any(not re.search(r'^\s*-?\s*\*?\(?none\)?\*?\s*$', r.strip("|").strip(), re.IGNORECASE) for r in rows[1:])

if dc_section and is_populated(body):
    sys.exit(0)

reason_lines = [
    f"Spec Design Calls Guard: '{rel}' has UI files in its write_set but lacks a populated `## Design calls` section.",
    f"  UI files detected: {', '.join(sorted(ui_hits))}",
    "  The `## Design calls` section is required when the spec's write_set intersects `project.json → tdd.ui_globs`.",
    "  See `.claude/skills/spec/template.md` for the canonical Design calls table shape.",
    "  See CLAUDE.md Article X.2 for the routing rule.",
]

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "\n".join(reason_lines),
    }
}))
PY
