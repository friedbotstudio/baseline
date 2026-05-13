#!/usr/bin/env bash
# Spec Diagram Presence Guard — PreToolUse(Write|Edit|MultiEdit)
#
# Enforces that docs/specs/*.md contains the diagram kinds required by the
# spec template. Complements artifact_template_guard (which checks headings)
# and plantuml_syntax_guard (which checks each block's syntax): this one
# ensures the right *kinds* of diagrams exist.
#
# Config source: .claude/project.json → artifacts.required_diagrams.spec
#
# Each entry is an object of the form:
#   "<kind>": {
#     "min":     <int>,           # required occurrences; default 1
#     "marker":  "<literal>",     # optional literal substring to look for
#     "any_of":  ["<regex>", ...] # optional list; a block matching ANY counts
#   }
#
# A fenced ```plantuml``` block counts toward <kind> if it contains the literal
# `marker` OR if any line matches any regex in `any_of`. The guard scans only
# inside plantuml fences — prose mentions don't satisfy the requirement.
#
# Template files (_TEMPLATE_*) are exempt. So is empty/whitespace-only content.

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

required_json="$(project_get .artifacts.required_diagrams.spec)"
if [ -z "$required_json" ] || [ "$required_json" = "None" ]; then
  emit_allow
fi

HOOK_FILE="$FILE" HOOK_TOOL="$TOOL" HOOK_REL="$rel" HOOK_REQ_JSON="$required_json" python3 <<'PY'
import json, os, pathlib, re, sys

payload = json.loads(os.environ.get("HOOK_PAYLOAD", "") or "{}")
tool    = os.environ["HOOK_TOOL"]
file_   = os.environ["HOOK_FILE"]
rel     = os.environ["HOOK_REL"]
try:
    required = json.loads(os.environ["HOOK_REQ_JSON"])
except Exception:
    sys.exit(0)
if not isinstance(required, dict):
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

fence_re = re.compile(r'^[ \t]*```[ \t]*plantuml[ \t]*$(.*?)^[ \t]*```[ \t]*$',
                      re.DOTALL | re.IGNORECASE | re.MULTILINE)
blocks = [m.group(1) for m in fence_re.finditer(content)]

def block_matches(body, rule):
    marker = rule.get("marker")
    if marker and marker in body:
        return True
    for pat in rule.get("any_of") or []:
        try:
            if re.search(pat, body, re.MULTILINE):
                return True
        except re.error:
            continue
    return False

missing = []
for kind, rule in required.items():
    if not isinstance(rule, dict):
        continue
    need = int(rule.get("min", 1))
    found = sum(1 for b in blocks if block_matches(b, rule))
    if found < need:
        missing.append((kind, need, found))

if not missing:
    sys.exit(0)

lines = [f"Spec Diagram Presence Guard: '{rel}' is missing required diagram kinds. Each kind must appear inside a ```plantuml``` fence."]
for kind, need, found in missing:
    lines.append(f"  - {kind}: need {need}, found {found}")
lines.append("See .claude/skills/spec/template.md for the canonical diagram skeletons (C4 Context/Container/Component, class, sequence, dependency graph).")
lines.append("Required kinds are configured at .claude/project.json → artifacts.required_diagrams.spec.")

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "\n".join(lines),
    }
}))
PY
