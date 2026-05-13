#!/usr/bin/env bash
# Artifact Template Guard — PreToolUse(Write|Edit|MultiEdit)
#
# Enforces that writes to docs/{intake,brd,specs,rca}/*.md include every
# required section heading for that artifact type. Required sections come
# from .claude/project.json → artifacts.required_sections.<type>.
#
# Template files (any basename starting with "_TEMPLATE_") are exempt — they
# ARE the canonical structure, and edits to them shouldn't self-check.
# Also exempt: writes where the proposed content is empty/whitespace only
# (the guard intervenes on substantive writes, not touch/clear operations).
#
# The guard inspects *proposed content* (what the tool is about to write),
# not the file on disk. For Edit: checks the resulting content by merging
# old_string → new_string into the existing file. For MultiEdit: same,
# applied sequentially. For Write: checks the new content directly.

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

# Identify artifact type from path.
artifact_type=""
case "$rel" in
  docs/intake/*.md) artifact_type="intake" ;;
  docs/brd/*.md)    artifact_type="brd" ;;
  docs/specs/*.md)  artifact_type="spec" ;;
  docs/rca/*.md)    artifact_type="rca" ;;
  *) emit_allow ;;
esac

# Exempt templates.
base="$(/usr/bin/basename "$rel" 2>/dev/null || echo "${rel##*/}")"
case "$base" in
  _TEMPLATE_*|*TEMPLATE*.md) emit_allow ;;
esac

# Fetch required sections for this artifact type.
required_json="$(project_get ".artifacts.required_sections.$artifact_type")"
if [ -z "$required_json" ] || [ "$required_json" = "None" ]; then
  # No requirements configured → don't enforce.
  emit_allow
fi

# Compute the resulting content the write would produce. For Write, that's
# tool_input.content. For Edit/MultiEdit, we apply the edits against the
# existing file (if any) to get the post-write content.
HOOK_FILE="$FILE" HOOK_TOOL="$TOOL" HOOK_REQ_JSON="$required_json" HOOK_REL="$rel" HOOK_ARTIFACT="$artifact_type" python3 <<'PY'
import json, os, re, sys, pathlib

payload = json.loads(os.environ.get("HOOK_PAYLOAD", "") or "{}")
tool    = os.environ["HOOK_TOOL"]
file_   = os.environ["HOOK_FILE"]
rel     = os.environ["HOOK_REL"]
atype   = os.environ["HOOK_ARTIFACT"]
req     = json.loads(os.environ["HOOK_REQ_JSON"])
if not isinstance(req, list):
    # Malformed config — don't enforce, fail open.
    sys.exit(0)

ti = payload.get("tool_input") or {}

def current_file_content():
    try:
        return pathlib.Path(file_).read_text(encoding="utf-8")
    except Exception:
        return ""

if tool == "Write":
    content = ti.get("content") or ""
elif tool == "Edit":
    base = current_file_content()
    old = ti.get("old_string") or ""
    new = ti.get("new_string") or ""
    if ti.get("replace_all"):
        content = base.replace(old, new)
    else:
        # Apply single replacement.
        content = base.replace(old, new, 1) if old in base else (base + new)
elif tool == "MultiEdit":
    content = current_file_content()
    for edit in (ti.get("edits") or []):
        old = edit.get("old_string") or ""
        new = edit.get("new_string") or ""
        if edit.get("replace_all"):
            content = content.replace(old, new)
        else:
            content = content.replace(old, new, 1) if old in content else (content + new)
else:
    sys.exit(0)

# Don't enforce on empty/whitespace-only content (touch or clear).
if not content.strip():
    sys.exit(0)

# Collect heading text (## and ### levels) from the content.
headings = set()
for ln in content.splitlines():
    m = re.match(r'^\s{0,3}#{2,4}\s+(.+?)\s*$', ln)
    if m:
        # Normalize: lowercase, strip trailing punctuation, collapse whitespace.
        h = re.sub(r'\s+', ' ', m.group(1).strip()).lower()
        h = h.rstrip(':').rstrip('.')
        headings.add(h)

missing = []
for r in req:
    r_norm = re.sub(r'\s+', ' ', str(r).strip()).lower().rstrip(':').rstrip('.')
    if r_norm not in headings:
        missing.append(r)

if not missing:
    sys.exit(0)

msg = (
    f"Artifact Template Guard: '{rel}' ({atype}) is missing required section(s): "
    f"{', '.join(missing)}. "
    f"Use the `{atype}` skill at .claude/skills/{atype}/SKILL.md (template at "
    f".claude/skills/{atype}/template.md) to produce a compliant document. "
    f"Every required heading must appear as a ## or ### heading."
)
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": msg,
    }
}))
PY

exit 0
