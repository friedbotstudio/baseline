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
# The lock is keyed on the build TARGET dir (via build-lock-dir.mjs) so builds
# into DIFFERENT targets — the isolated tmpdir builds from the parallel test
# suite — no longer serialize machine-wide, while builds into the SAME target
# (prepack + a live-tree build) still share one lock. See build-lock-dir.mjs.
LOCK_DIR="$(node "$SCRIPT_DIR/build-lock-dir.mjs" "$TEMPLATE_DIR")"
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
for runtime_file in _pending _resume _thread; do
  src_template="$PKG_ROOT/src/memory/${runtime_file}.template.md"
  dev_target="$PKG_ROOT/.claude/memory/${runtime_file}.md"
  if [ -f "$src_template" ] && [ ! -f "$dev_target" ]; then
    cp "$src_template" "$dev_target"
    echo "build: seeded $dev_target from template (runtime file was missing)" >&2
  fi
done

AUDIT_SCRIPT="$PKG_ROOT/.claude/skills/audit-baseline/audit.mjs"

# Stage 0b — sync vendored mirrors from src/cli/ into the dev tree.
#
# The five workflows.jsonl-driven modules canonically live under `src/cli/`
# (where tests, bin/cli.js, and the maintainer's mental model expect them).
# They ALSO ship to consumers under `.claude/skills/{triage,harness}/` so
# `seed-tasklist.mjs` and the harness migrator invocation can resolve their
# imports against the consumer's installed tree. Without this stage the
# mirrors drift the moment a maintainer edits a canonical source — and
# `tests/vendored-mirror-bytes.test.mjs` fails CI.
#
# Paths are unrolled (not loop-generated) so `grep src/cli/<mod>.js` from a
# maintainer's terminal finds the exact wiring line in this script.
# Run BEFORE Stage 1 so the recursive copy picks up freshly-synced mirrors.
# Each cp is conditional on the canonical source existing — fixture-based
# test projects (tests/build-template.test.mjs) override PKG_ROOT and don't
# carry the dev tree's src/cli/ directory; skip silently there.
sync_vendored_mirror() {
  local src="$1" dst="$2"
  if [ -f "$src" ]; then
    cp "$src" "$dst"
  fi
}
sync_vendored_mirror "$PKG_ROOT/src/cli/workflows-validator.js"            "$PKG_ROOT/.claude/skills/triage/workflows-validator.js"
sync_vendored_mirror "$PKG_ROOT/src/cli/workflows-validator-invariants.js" "$PKG_ROOT/.claude/skills/triage/workflows-validator-invariants.js"
sync_vendored_mirror "$PKG_ROOT/src/cli/workflows-validator-predicates.js" "$PKG_ROOT/.claude/skills/triage/workflows-validator-predicates.js"
sync_vendored_mirror "$PKG_ROOT/src/cli/track-tasklist-materializer.js"    "$PKG_ROOT/.claude/skills/triage/track-tasklist-materializer.js"
sync_vendored_mirror "$PKG_ROOT/src/cli/workflow-migrator.js"              "$PKG_ROOT/.claude/skills/harness/workflow-migrator.js"

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
  --exclude='memory/_thread.md' \
  --exclude='skill-memory/' \
  --exclude='agent-memory/' \
  --exclude='workflows.jsonl' \
  --exclude='.DS_Store' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  "$PKG_ROOT/.claude/" "$TEMPLATE_DIR/.claude/"

# Stage 1.5 — prune dev-only skills.
#
# CLAUDE.md Article XI declares "absence of `owner:` is the deliberate default"
# for user/third-party skills. The audit (.claude/skills/audit-baseline/audit.mjs)
# and the shipped manifest (build-manifest.mjs:collectOwnersFromTemplate) both
# already use `owner: baseline` as the canonical signal for baseline ownership.
# This stage closes the loop on the build side so dev-only skills — anything
# maintained in `.claude/skills/` of the baseline repo for the maintainer's own
# workflow (e.g., `cli-copy-review`) — stay out of the shipped tree without
# per-skill rsync-exclude maintenance.
#
# Policy: a skill ships iff its SKILL.md's frontmatter contains `owner: baseline`.
# Anything else (no `owner:` at all, `owner: user`, malformed frontmatter) is
# pruned from the shipped template. The awk pipeline below extracts the
# frontmatter block (everything between the first two `---` lines) and greps
# for the exact `owner: baseline` line, mirroring build-manifest.mjs's parser.
for skill_md in "$TEMPLATE_DIR"/.claude/skills/*/SKILL.md; do
  [ -f "$skill_md" ] || continue
  if ! awk '/^---$/{c++; if (c==2) exit} c==1' "$skill_md" | grep -qE '^owner:[[:space:]]+baseline[[:space:]]*$'; then
    skill_dir="$(dirname "$skill_md")"
    echo "build: pruning dev-only skill $(basename "$skill_dir") (no owner: baseline)" >&2
    rm -rf "$skill_dir"
  fi
done

# Stage 1.6 — scan shipped SKILL.md prose for dev-tree refs + unshipped imports.
#
# Closes the v0.8.1-class failure mode: a baseline-owned SKILL.md that contains
# `node -e "import('./src/foo.js')..."` in a shell fence will succeed during
# spec-draft review (spec-shippability-review catches NEW occurrences in spec
# drafts) but slip through if it was already on disk before the check existed.
# This stage re-validates the actual shipped SKILL.md content at every build,
# using --shipped-tree to derive the shipped-files set from $TEMPLATE_DIR
# directly (manifest.json isn't stamped until Stage 3).
#
# Scanner exit codes: 0 CLEAN, 1 NEEDS_REVIEW (no-op for build — advisory),
# 2 BLOCKED (build aborts). Exit 3 = missing root (also abort).
SCANNER="$PKG_ROOT/.claude/skills/spec-shippability-review/scan-shipped-skills.mjs"
if [ -f "$SCANNER" ]; then
  if ! node "$SCANNER" \
      --root "$TEMPLATE_DIR/.claude/skills" \
      --shipped-tree "$TEMPLATE_DIR/.claude" \
      --report-root "$PKG_ROOT" >&2; then
    scan_exit=$?
    if [ "$scan_exit" = "2" ] || [ "$scan_exit" = "3" ]; then
      echo "build aborted: spec-shippability-review reported BLOCKER findings in shipped SKILL.md" >&2
      exit 1
    fi
  fi
fi

# Stage 2 — overlay pristine templates from src/.
cp "$PKG_ROOT/src/CLAUDE.template.md"      "$TEMPLATE_DIR/CLAUDE.md"
cp "$PKG_ROOT/src/seed.template.md"        "$TEMPLATE_DIR/docs/init/seed.md"
cp "$PKG_ROOT/src/.mcp.template.json"      "$TEMPLATE_DIR/.mcp.json"
cp "$PKG_ROOT/src/project.template.json"   "$TEMPLATE_DIR/.claude/project.json"
cp "$PKG_ROOT/src/settings.template.json"  "$TEMPLATE_DIR/.claude/settings.json"
cp "$PKG_ROOT/src/.claude/workflows.template.jsonl" "$TEMPLATE_DIR/.claude/workflows.jsonl"
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
  # --skip-hash-check: the manifest was just stamped (Stage 3) from this same
  # source this run, so re-hashing those files here is tautological. Presence and
  # every other drift check still run. The STANDALONE audit (verify/integrate
  # verdict) runs WITHOUT this flag and keeps full hash-drift detection.
  if ! CLAUDE_PROJECT_DIR="$PKG_ROOT" node "$AUDIT_SCRIPT" --skip-hash-check >&2; then
    echo "build aborted: audit-baseline reported failures (see above)" >&2
    exit 1
  fi
fi
