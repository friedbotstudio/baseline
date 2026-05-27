#!/usr/bin/env bash
# PlantUML Syntax Guard — PreToolUse(Write|Edit|MultiEdit)
#
# Validates every ```plantuml``` fenced block inside writes to docs/specs/*.md.
# The spec template is diagram-driven; a spec with broken PlantUML is useless
# to reviewers and breaks /spec-render. Catching it at the write boundary
# prevents broken diagrams from ever landing on disk.
#
# How it validates:
#   1. Extract every ```plantuml ...``` fenced block from the proposed content.
#   2. For each block, pipe to `java -jar .claude/bin/plantuml.jar -checkonly -pipe`
#      and capture exit code.
#   3. Any non-zero exit → block the write with a reason naming the offending
#      block (1-indexed) and its first line.
#
# Guide mode (advisory):
#   - If the pinned plantuml.jar is absent, emit a one-line info message + allow.
#   - If Java is not on PATH, emit a one-line info message + allow.
#   - If a spec has zero plantuml blocks, allow — spec_diagram_presence_guard
#     is the hook that enforces presence.
#
# Template files (_TEMPLATE_*) are exempt.

# Capture caller-PATH java availability BEFORE common.sh restores the defensive
# PATH (which would re-inject /usr/bin and mask deliberately-stripped PATHs in
# tests for the "java absent" branch).
if command -v java >/dev/null 2>&1; then
  HAS_JAVA=1
else
  HAS_JAVA=0
fi

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

# Only enforce on spec artifacts.
case "$rel" in
  docs/specs/*.md) ;;
  *) emit_allow ;;
esac

# Exempt templates.
base="${rel##*/}"
case "$base" in
  _TEMPLATE_*|*TEMPLATE*.md) emit_allow ;;
esac

# Resolve the pinned jar location. The jar is fetched at install time by
# src/cli/plantuml.js → fetchPlantumlIfMissing; runtime invocations target
# the exact pinned sha256 so the version a consumer install validates against
# matches the version this baseline was tested against.
PLANTUML_JAR="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/bin/plantuml.jar"

# Guide mode when the jar is absent (e.g. consumer used --no-plantuml or the
# fetch failed). The hook MUST NOT block writes in that state.
if [ ! -f "$PLANTUML_JAR" ]; then
  emit_info "PlantUML validation in guide mode — \`java -jar .claude/bin/plantuml.jar\` is required for strict syntax check. The jar is absent at $PLANTUML_JAR (re-run \`npx @friedbotstudio/create-baseline install\` to fetch). Skipping syntax check for '$rel'."
  log_line plantuml_syntax_guard "GUIDE (no plantuml.jar) $rel"
  emit_allow
fi

# Guide mode when Java is not on PATH. Same posture — info + allow. The
# availability was captured BEFORE common.sh ran the defensive PATH expansion.
if [ "$HAS_JAVA" = "0" ]; then
  emit_info "PlantUML validation in guide mode — Java is missing from PATH. Install JDK 8+ (e.g. \`brew install openjdk\` on macOS, \`apt install default-jre\` on Debian/Ubuntu) to enable strict validation. Skipping syntax check for '$rel'."
  log_line plantuml_syntax_guard "GUIDE (no java) $rel"
  emit_allow
fi

# Compute the post-write content (same merge strategy as artifact_template_guard).
HOOK_FILE="$FILE" HOOK_TOOL="$TOOL" HOOK_REL="$rel" python3 <<'PY' >/tmp/.plantuml_guard_content.$$ 2>/dev/null
import json, os, pathlib, sys

payload = json.loads(os.environ.get("HOOK_PAYLOAD", "") or "{}")
tool    = os.environ["HOOK_TOOL"]
file_   = os.environ["HOOK_FILE"]
ti      = payload.get("tool_input") or {}

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
    content = ""

sys.stdout.write(content)
PY

CONTENT_FILE="/tmp/.plantuml_guard_content.$$"
trap 'rm -f "$CONTENT_FILE"' EXIT

# Extract plantuml blocks and validate each. Python does the heavy lifting so
# we don't have to reason about multiline regex in bash.
HOOK_REL="$rel" HOOK_CONTENT_FILE="$CONTENT_FILE" HOOK_PLANTUML_JAR="$PLANTUML_JAR" python3 <<'PY'
import json, os, re, subprocess, sys

rel   = os.environ["HOOK_REL"]
try:
    content = open(os.environ["HOOK_CONTENT_FILE"], encoding="utf-8").read()
except Exception:
    content = ""

if not content.strip():
    sys.exit(0)

# Match ```plantuml ... ``` fenced blocks (case-insensitive language tag).
fence_re = re.compile(r'^[ \t]*```[ \t]*plantuml[ \t]*$(.*?)^[ \t]*```[ \t]*$',
                      re.DOTALL | re.IGNORECASE | re.MULTILINE)
blocks = [m.group(1) for m in fence_re.finditer(content)]
if not blocks:
    # No PlantUML blocks → nothing to validate. Presence is a separate guard.
    sys.exit(0)

failures = []
for idx, body in enumerate(blocks, start=1):
    src = body.strip("\n")
    # Ensure the block has a @startuml/@enduml envelope; plantuml requires it.
    if "@startuml" not in src:
        src = "@startuml\n" + src + "\n@enduml\n"
    first_line = next((ln for ln in src.splitlines() if ln.strip() and not ln.strip().startswith("@start")), "").strip()[:80]
    try:
        r = subprocess.run(
            ["java", "-jar", os.environ["HOOK_PLANTUML_JAR"], "-checkonly", "-pipe"],
            input=src.encode("utf-8"),
            capture_output=True,
            timeout=15,
        )
    except FileNotFoundError:
        # Race: vanished between the bash check and here. Guide mode.
        sys.exit(0)
    except subprocess.TimeoutExpired:
        failures.append((idx, first_line, "plantuml -checkonly timed out after 15s"))
        continue
    if r.returncode != 0:
        err = (r.stderr or r.stdout or b"").decode("utf-8", errors="replace").strip().splitlines()
        detail = " | ".join(err[-3:]) if err else f"exit={r.returncode}"
        failures.append((idx, first_line, detail))

if not failures:
    sys.exit(0)

lines = [f"PlantUML Syntax Guard: '{rel}' has invalid PlantUML in {len(failures)} block(s). Fix and re-run."]
for idx, first_line, detail in failures:
    label = f'"{first_line}"' if first_line else "(empty first line)"
    lines.append(f"  - block #{idx} {label}: {detail}")
lines.append("Tip: render interactively via the plantuml MCP server, or run `/spec-lint <slug>` to iterate before saving.")

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "\n".join(lines),
    }
}))
PY
