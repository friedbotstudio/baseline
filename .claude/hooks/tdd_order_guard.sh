#!/usr/bin/env bash
# TDD Order Guard — PreToolUse(Write)
#
# When Claude creates a new source file (first write, file does not exist),
# require that a corresponding test file already exists. Enforces
# test-before-source TDD per seed.md § "TDD order guard".
#
# Applies only if .tdd.enabled is true in project.json. Skips edits to
# existing files (TDD ordering applies to file creation, not later edits).
# Honours source/test/exempt globs from project.json.

# shellcheck source=./lib/common.sh
. "${BASH_SOURCE[0]%/*}/lib/common.sh"
read_payload

TOOL="$(payload_get .tool_name)"
[ "$TOOL" = "Write" ] || emit_allow

enabled="$(project_get .tdd.enabled)"
[ "$enabled" = "True" ] || [ "$enabled" = "true" ] || emit_allow

FILE="$(payload_get .tool_input.file_path)"
[ -n "$FILE" ] || emit_allow

# Only apply on file *creation*. If file already exists, it's an edit.
[ -e "$FILE" ] && emit_allow

# Relative path for glob matching.
rel="${FILE#$CLAUDE_PROJECT_ROOT/}"

# Exempt patterns (docs, config, .claude itself, etc.).
if path_matches_globs "$rel" "$(project_get .tdd.exempt_globs)"; then
  emit_allow
fi

# Not a source path → nothing to enforce.
if ! path_matches_globs "$rel" "$(project_get .tdd.source_globs)"; then
  emit_allow
fi

# Never gate test files themselves.
if path_matches_globs "$rel" "$(project_get .tdd.test_globs)"; then
  emit_allow
fi

# Look for a corresponding test file. Candidates are derived from
# `project.json → tdd.test_globs` so customized projects (Go-style
# `<pkg>_test.go`, Rust `tests/integration.rs`, jest `__tests__/*`,
# etc.) are honored without code changes here.
stem="$(basename "$FILE")"
name="${stem%.*}"
ext="${stem##*.}"
dir="$(dirname "$rel")"

# Candidate generation in Python — reads tdd.test_globs and produces
# combinations of {dir-root × name × suffix/prefix} plus mirrored layout.
candidates="$(python3 - "$rel" "$CLAUDE_PROJECT_ROOT" <<'PY' 2>/dev/null || true
import sys, os, re, json, pathlib

rel       = sys.argv[1]
root      = pathlib.Path(sys.argv[2])
proj_path = root / ".claude/project.json"
try:
    cfg = json.loads(proj_path.read_text(encoding="utf-8"))
except Exception:
    cfg = {}
test_globs = (cfg.get("tdd", {}) or {}).get("test_globs", []) or []

stem = os.path.basename(rel)
name, _, ext = stem.rpartition(".")
ext = ext or "py"
src_dir = os.path.dirname(rel)

# Extension family — when source is .js/.mjs/.cjs, tests may use any of
# the JS-ESM-family extensions. Same for .ts/.tsx/.mts/.cts. Without this,
# a .js source whose test is .mjs (a common node:test ESM convention)
# would fail the existence check and the guard would falsely block.
JS_FAMILY = {"js", "mjs", "cjs"}
TS_FAMILY = {"ts", "tsx", "mts", "cts"}
if ext in JS_FAMILY:
    ext_variants = list(JS_FAMILY)
elif ext in TS_FAMILY:
    ext_variants = list(TS_FAMILY)
else:
    ext_variants = [ext]

# Strip a source-root prefix so candidates can mirror the layout under a
# parallel test-root: src/foo/bar.py → foo/bar.py.
src_subpath = rel
for r in ("src/", "lib/", "app/", "pkg/", "internal/"):
    if rel.startswith(r):
        src_subpath = rel[len(r):]
        break
src_subpath_noext = re.sub(r"\.[^./]+$", "", src_subpath)

suffix_patterns = []   # e.g. "_test", ".test", ".spec" — appended to name
prefix_patterns = []   # e.g. "test_" — prepended to name
dir_roots       = []   # e.g. "tests", "test", "spec", "__tests__"

for g in test_globs:
    # **/*<sep><word>.*    → suffix `<sep><word>`  e.g. "_test", ".test"
    m = re.match(r"^\*\*/\*([._-][^*/.]+)\.\*$", g)
    if m:
        suffix_patterns.append(m.group(1))
        continue
    # **/<word>_*.*        → prefix "<word>_"     e.g. "test_*"
    m = re.match(r"^\*\*/([^*/.]+)_\*\.\*$", g)
    if m:
        prefix_patterns.append(m.group(1) + "_")
        continue
    # <dir>/**             → directory root
    m = re.match(r"^([\w._-]+)/\*\*$", g)
    if m:
        dir_roots.append(m.group(1))
        continue

# Backstop conventions for any pattern dimension the configured globs
# don't cover. The common project.json ships directory globs only
# (`tests/**` etc.) — without these backstops we'd miss pytest's
# `test_<name>` prefix and the standard `_test`/`.test`/`.spec` suffixes.
if not suffix_patterns:
    suffix_patterns = ["_test", ".test", ".spec"]
if not prefix_patterns:
    prefix_patterns = ["test_"]
if not dir_roots:
    dir_roots = ["tests", "test", "spec", "__tests__"]

cands = set()
def add(p): cands.add(p.lstrip("/"))

# Co-located beside the source file (across extension family)
for e in ext_variants:
    for s in suffix_patterns:
        add(f"{src_dir}/{name}{s}.{e}")
    for p in prefix_patterns:
        add(f"{src_dir}/{p}{name}.{e}")

# Under each dir-root: stem-based + mirrored-layout (across extension family)
for d in dir_roots:
    add(f"{d}/{src_subpath}")           # mirror layout: tests/foo/bar.py
    for e in ext_variants:
        add(f"{d}/{name}.{e}")          # plain stem (Rust-like)
        for s in suffix_patterns:
            add(f"{d}/{name}{s}.{e}")
            add(f"{d}/{src_subpath_noext}{s}.{e}")
        for p in prefix_patterns:
            add(f"{d}/{p}{name}.{e}")
            add(f"{d}/{p}{src_subpath_noext}.{e}")

# Co-located inside __tests__-style subdirs (Jest)
for d in dir_roots:
    if d.startswith("_") or d == "__tests__":
        for e in ext_variants:
            for s in suffix_patterns:
                add(f"{src_dir}/{d}/{name}{s}.{e}")

print("\n".join(sorted(cands)))
PY
)"

found=""
while IFS= read -r c; do
  [ -z "$c" ] && continue
  if [ -f "$CLAUDE_PROJECT_ROOT/$c" ]; then
    found="$c"
    break
  fi
done <<< "$candidates"

if [ -n "$found" ]; then
  log_line tdd_order_guard "ALLOWED test exists: $found for $rel"
  emit_allow
fi

log_line tdd_order_guard "BLOCKED no test for: $rel"
emit_block "TDD Order Guard: no test file found for new source '$rel'. Write the failing test first. Candidates were derived from project.json → tdd.test_globs (e.g. tests/${name}_test.${ext}, ${dir}/${name}_test.${ext}, tests/${src_subpath_noext:-${name}}.${ext}). If this file truly has no tests by design, add the path to .tdd.exempt_globs in .claude/project.json."
