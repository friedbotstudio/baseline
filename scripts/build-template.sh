#!/usr/bin/env bash
set -euo pipefail

# Build the npm-shipped `template/` directory.
#
# Purpose: ship exactly the baseline product (constitution + enforcement layer +
# defaults), and nothing else. The payload's path set is asserted by
# `tests/template-payload.test.mjs`.
#
# Strategy (allowlist):
#   1. Bulk-copy `.claude/` minus runtime state and dev-local overrides.
#   2. Overlay pristine ship-time copies from `src/*.template.*` for the eight
#      files that must NOT carry session/dev-repo drift (CLAUDE.md, seed.md,
#      .mcp.json, .claude/project.json, .claude/settings.json, the swarm-worker
#      agent, plus all 8 .claude/memory/*.md files).
#   3. Stamp `template/manifest.json` (sha256 table consumed by `--merge`).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_ROOT="${PKG_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
# All build outputs live under obj/ so the repo root stays clean of artifacts.
# This path also appears in package.json's `files` array — moving it requires
# updating that too.
TEMPLATE_DIR="$PKG_ROOT/obj/template"

# Serialize concurrent invocations. `npm pack` runs this as `prepack`; the
# publish:check smoke test plus several other tests trigger `npm pack` from
# subprocesses and would race on obj/template/ rebuild without this.
# Uses mkdir as a portable atomic mutex (works on macOS + Linux without flock).
LOCK_DIR="${TMPDIR:-/tmp}/create-baseline-build.lock.d"
LOCK_WAITED=0
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  sleep 0.2
  LOCK_WAITED=$((LOCK_WAITED + 1))
  if [ "$LOCK_WAITED" -gt 300 ]; then
    echo "build-template.sh: timed out waiting for $LOCK_DIR; remove it if stale" >&2
    exit 1
  fi
done
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# Stage 0a — seed runtime memory placeholders in the dev repo if missing.
# .claude/memory/_pending.md and _resume.md are runtime-managed (written by
# memory_stop and memory_pre_compact / memory_session_start respectively) and
# gitignored, so a fresh clone (CI build, dependabot rebase) does not contain
# them. The audit-baseline gate below requires all 8 canonical memory files
# present on disk, so seed the two runtime files from src/memory/*.template.md
# if absent. Existing files are preserved (this is "seed if missing", not
# "overwrite"). The same templates are used by stage 2 to overlay into the
# shipped template tree, so dev repo and shipped tree start from identical
# placeholders.
for runtime_file in _pending _resume; do
  src_template="$PKG_ROOT/src/memory/${runtime_file}.template.md"
  dev_target="$PKG_ROOT/.claude/memory/${runtime_file}.md"
  if [ -f "$src_template" ] && [ ! -f "$dev_target" ]; then
    cp "$src_template" "$dev_target"
    echo "build: seeded $dev_target from template (runtime file was missing)" >&2
  fi
done

AUDIT_SCRIPT="$PKG_ROOT/.claude/skills/audit-baseline/audit.sh"

rm -rf "$TEMPLATE_DIR"
mkdir -p "$TEMPLATE_DIR/.claude" "$TEMPLATE_DIR/docs/init"

# Stage 1 — bulk-copy .claude/ verbatim.
# Excluded:
#   state/                  — runtime state, regenerated per session
#   .baseline-manifest.json — written by the CLI into target/, not by build
#   settings.local.json     — dev-local settings overrides
#   bin/plantuml.jar        — ~19 MB, side-fetched at install time
#   memory/_pending.md      — auto-extraction inbox (dev repo's is non-empty;
#                             the pristine ship-time placeholder is overlaid
#                             from src/memory/_pending.template.md in stage 2)
#   memory/_resume.md       — session continuity snapshot (dev repo's holds dev
#                             state; pristine placeholder overlaid in stage 2)
#   skill-memory/           — per-skill working memory; gitignored; dev-repo
#                             accumulates per-skill conventions that don't
#                             belong in the published baseline
#   agent-memory/           — legacy subagent memory dirs (gitignored per
#                             .gitignore); defensive exclude in case stragglers
#                             from pre-2026-04-27 refactor reappear
#   .DS_Store               — macOS Finder metadata; defensive exclude
rsync -a \
  --exclude='state/' \
  --exclude='.baseline-manifest.json' \
  --exclude='settings.local.json' \
  --exclude='bin/plantuml.jar' \
  --exclude='memory/_pending.md' \
  --exclude='memory/_resume.md' \
  --exclude='skill-memory/' \
  --exclude='agent-memory/' \
  --exclude='.DS_Store' \
  "$PKG_ROOT/.claude/" "$TEMPLATE_DIR/.claude/"

# Stage 2 — overlay pristine templates from src/.
cp "$PKG_ROOT/src/CLAUDE.template.md"      "$TEMPLATE_DIR/CLAUDE.md"
cp "$PKG_ROOT/src/seed.template.md"        "$TEMPLATE_DIR/docs/init/seed.md"
cp "$PKG_ROOT/src/.mcp.template.json"      "$TEMPLATE_DIR/.mcp.json"
cp "$PKG_ROOT/src/project.template.json"   "$TEMPLATE_DIR/.claude/project.json"
cp "$PKG_ROOT/src/settings.template.json"  "$TEMPLATE_DIR/.claude/settings.json"
# NOTE: src/.npmrc.template intentionally NOT overlaid into obj/template/.
# npm pack drops any file named `.npmrc` from the published tarball as a
# defense against shipping registry credentials. We ship the canonical bytes
# inside src/.npmrc.template (a non-excluded filename) and let install.js
# overlay them into target/.npmrc at install time.

mkdir -p "$TEMPLATE_DIR/.claude/agents"
node "$SCRIPT_DIR/render-swarm-worker.mjs" \
  "$PKG_ROOT/src/agents/swarm-worker.template.md" \
  "$TEMPLATE_DIR/.claude/agents/swarm-worker.md"

mkdir -p "$TEMPLATE_DIR/.claude/memory"
for src_file in "$PKG_ROOT/src/memory/"*.template.md; do
  base="$(basename "$src_file" .template.md)"
  cp "$src_file" "$TEMPLATE_DIR/.claude/memory/${base}.md"
done

# Stage 3 — build the sha256 manifest.
node "$SCRIPT_DIR/build-manifest.mjs" "$TEMPLATE_DIR"

# Stage 4 — gate on audit-baseline AFTER the manifest is fresh so a polluted
# src/ template can't reach npm. Reordered from Stage 0 (pre-2026-05-18) because
# audit-baseline's skill-ownership hash check reads manifest.owners.skills and
# the per-file `manifest.files` hash table — both of which are written by
# Stage 3. Running the audit before Stage 3 created a chicken-and-egg loop on
# any workflow that edited baseline-owned SKILL.md files: the audit's hash
# check would fail against the stale manifest, the build would abort before
# Stage 3, and the manifest would never be regenerated. Audit always runs
# against PKG_ROOT (the dev repo, not obj/template), so its target is unchanged
# by this reorder; only the manifest it reads is now fresh. Skipped if the
# audit script is absent (e.g., in build-template fixture tests).
if [ -f "$AUDIT_SCRIPT" ]; then
  if ! CLAUDE_PROJECT_DIR="$PKG_ROOT" bash "$AUDIT_SCRIPT" >&2; then
    echo "build aborted: audit-baseline reported failures (see above)" >&2
    exit 1
  fi
fi
