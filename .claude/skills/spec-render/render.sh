#!/usr/bin/env bash
# spec-render — extract every ```plantuml``` block from docs/specs/<slug>.md,
# classify it, render to SVG, and write an index.md.
#
# Usage: .claude/skills/spec-render/render.sh <slug>

set -eu

if [ "${1:-}" = "" ]; then
  echo "usage: render.sh <slug>" >&2
  exit 2
fi
SLUG="$1"

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
SPEC="$ROOT/docs/specs/$SLUG.md"
OUT="$ROOT/docs/specs/_rendered/$SLUG"

if [ ! -f "$SPEC" ]; then
  echo "spec-render: spec not found at $SPEC" >&2
  exit 2
fi

PLANTUML_JAR="$ROOT/.claude/bin/plantuml.jar"

if [ ! -f "$PLANTUML_JAR" ]; then
  echo "spec-render: plantuml.jar not found at $PLANTUML_JAR. Re-run \`npx @friedbotstudio/create-baseline install\` to fetch it." >&2
  exit 2
fi

if ! command -v java >/dev/null 2>&1; then
  echo "spec-render: java not on PATH. Install JDK 8+ (e.g. \`brew install openjdk\` on macOS, \`apt install default-jre\` on Debian/Ubuntu) and re-run." >&2
  exit 2
fi

mkdir -p "$OUT"
rm -f "$OUT"/*.puml "$OUT"/*.svg "$OUT"/index.md 2>/dev/null || true

# Extract + classify + write .puml files.
SPEC="$SPEC" OUT="$OUT" SLUG="$SLUG" python3 <<'PY'
import os, re, sys

spec = open(os.environ["SPEC"], encoding="utf-8").read()
out  = os.environ["OUT"]
slug = os.environ["SLUG"]

fence_re = re.compile(r'^[ \t]*```[ \t]*plantuml[ \t]*$(.*?)^[ \t]*```[ \t]*$',
                      re.DOTALL | re.IGNORECASE | re.MULTILINE)

def classify(body):
    lowered = body.lower()
    if "!include <c4/c4_context>"   in lowered: return "c4_context"
    if "!include <c4/c4_container>" in lowered: return "c4_container"
    if "!include <c4/c4_component>" in lowered: return "c4_component"
    if re.search(r"'\s*@kind\s+dependency-graph", body): return "dependency_graph"
    if re.search(r"^\s*(participant|actor)\b", body, re.MULTILINE): return "sequence"
    if re.search(r"^\s*\[\*\]\s*-->", body, re.MULTILINE): return "state"
    if re.search(r"^\s*class\s+\w", body, re.MULTILINE): return "class"
    return "other"

# Section title from the last preceding ### heading (for the index).
heading_re = re.compile(r'^\s{0,3}#{2,4}\s+(.+?)\s*$', re.MULTILINE)

blocks = []
for m in fence_re.finditer(spec):
    before = spec[:m.start()]
    headings = heading_re.findall(before)
    section = headings[-1].strip() if headings else "(untitled)"
    body = m.group(1).strip("\n")
    if "@startuml" not in body:
        body = "@startuml\n" + body + "\n@enduml\n"
    kind = classify(body)
    blocks.append((section, kind, body))

if not blocks:
    print("spec-render: no ```plantuml``` blocks found", file=sys.stderr)
    sys.exit(1)

index_lines = [f"# Rendered diagrams — {slug}", ""]
for i, (section, kind, body) in enumerate(blocks, start=1):
    stem = f"{i:02d}_{kind}"
    puml_path = os.path.join(out, stem + ".puml")
    with open(puml_path, "w", encoding="utf-8") as f:
        f.write(body if body.endswith("\n") else body + "\n")
    index_lines.append(f"## {i:02d}. {section} — `{kind}`")
    index_lines.append("")
    index_lines.append(f"![{kind}]({stem}.svg)")
    index_lines.append("")
    index_lines.append(f"Source: [`{stem}.puml`]({stem}.puml)")
    index_lines.append("")

with open(os.path.join(out, "index.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(index_lines))
print(f"spec-render: extracted {len(blocks)} block(s)")
PY

# Render each .puml to SVG. Fail loud on any error.
fail=0
for puml in "$OUT"/*.puml; do
  [ -f "$puml" ] || continue
  if ! java -jar "$PLANTUML_JAR" -tsvg -o "$OUT" "$puml" 2>"$OUT/.render.err"; then
    echo "spec-render: FAILED to render ${puml##*/}" >&2
    sed -n '1,10p' "$OUT/.render.err" >&2
    fail=1
  fi
done
rm -f "$OUT/.render.err"

if [ "$fail" -ne 0 ]; then
  echo "spec-render: one or more blocks failed to render. See errors above." >&2
  exit 1
fi

# Count per kind for the user summary.
echo "spec-render: wrote $OUT/index.md"
ls "$OUT" | awk -F_ '/\.svg$/ { sub(/\.svg$/, "", $0); sub(/^[0-9]+_/, "", $0); kinds[$0]++ } END { for (k in kinds) printf "  %s: %d\n", k, kinds[k] }'
