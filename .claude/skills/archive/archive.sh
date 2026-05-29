#!/usr/bin/env bash
# archive.sh — Phase 10.5 archival.
# Moves all slug-matched workflow artifacts into docs/archive/<YYYY-MM-DD>/<slug>/.
# Never moves workflow.json (that's /commit's job).
#
# Usage:  archive.sh <slug>
#
# Exit codes:
#   0  archive complete (including "nothing to archive" — idempotent)
#   1  archive target already exists with conflicting files (re-run hazard)
#   2  bad invocation / missing slug

set -u

if [ "${1:-}" = "" ]; then
    echo "usage: archive.sh <slug>" >&2
    exit 2
fi
SLUG="$1"
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
DATE="$(date -u +%Y-%m-%d)"
BUNDLE="$ROOT/docs/archive/$DATE/$SLUG"

# Use `git mv` when in a git repo (preserves history); else plain mv.
USE_GIT=0
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    USE_GIT=1
fi

mkdir -p "$BUNDLE"

move() {
    # $1 = source abs path, $2 = target abs path (must not exist)
    local src="$1" dst="$2"
    if [ ! -e "$src" ]; then
        return 0
    fi
    if [ -e "$dst" ]; then
        echo "archive: refusing to overwrite existing $dst" >&2
        return 1
    fi
    mkdir -p "$(dirname "$dst")"
    if [ "$USE_GIT" = "1" ] && git -C "$ROOT" ls-files --error-unmatch "${src#$ROOT/}" >/dev/null 2>&1; then
        git -C "$ROOT" mv "${src#$ROOT/}" "${dst#$ROOT/}"
    else
        mv "$src" "$dst"
    fi
    echo "  moved: ${src#$ROOT/} -> ${dst#$ROOT/}"
}

count_moved=0
failed=0

declare -a PAIRS=(
    "docs/intake/$SLUG.md                            intake.md"
    "docs/brief/$SLUG.md                             brief.md"
    "docs/brd/$SLUG.md                               brd.md"
    "docs/scout/$SLUG.md                             scout.md"
    "docs/research/$SLUG.md                          research.md"
    "docs/specs/$SLUG.md                             spec.md"
    ".claude/state/spec_approvals/$SLUG.approval     spec.approved"
    ".claude/state/swarm/$SLUG.json                  swarm.json"
    ".claude/state/swarm_approvals/$SLUG.approval    swarm.approved"
)

for pair in "${PAIRS[@]}"; do
    # shellcheck disable=SC2086
    set -- $pair
    src_rel="$1"
    dst_name="$2"
    src="$ROOT/$src_rel"
    dst="$BUNDLE/$dst_name"
    if [ -e "$src" ]; then
        if move "$src" "$dst"; then
            count_moved=$((count_moved + 1))
        else
            failed=$((failed + 1))
        fi
    fi
done

# Rendered diagrams directory (whole subtree).
RENDERED_SRC="$ROOT/docs/specs/_rendered/$SLUG"
RENDERED_DST="$BUNDLE/spec-rendered"
if [ -d "$RENDERED_SRC" ]; then
    if [ -e "$RENDERED_DST" ]; then
        echo "archive: refusing to overwrite existing $RENDERED_DST" >&2
        failed=$((failed + 1))
    else
        if [ "$USE_GIT" = "1" ] && git -C "$ROOT" ls-files --error-unmatch "docs/specs/_rendered/$SLUG" >/dev/null 2>&1; then
            git -C "$ROOT" mv "docs/specs/_rendered/$SLUG" "docs/archive/$DATE/$SLUG/spec-rendered"
        else
            mv "$RENDERED_SRC" "$RENDERED_DST"
        fi
        echo "  moved: docs/specs/_rendered/$SLUG -> docs/archive/$DATE/$SLUG/spec-rendered"
        count_moved=$((count_moved + 1))
    fi
fi

# Security reports (multiple files possible).
shopt -s nullglob
for sec in "$ROOT"/docs/security/$SLUG-*.md; do
    if [ -e "$sec" ]; then
        # Concatenate into one security.md in the bundle.
        {
            echo "# Security reports — $SLUG"
            echo
            for f in "$ROOT"/docs/security/$SLUG-*.md; do
                [ -e "$f" ] || continue
                echo "## $(basename "$f")"
                echo
                cat "$f"
                echo
            done
        } > "$BUNDLE/security.md"
        # Remove originals.
        for f in "$ROOT"/docs/security/$SLUG-*.md; do
            [ -e "$f" ] || continue
            if [ "$USE_GIT" = "1" ] && git -C "$ROOT" ls-files --error-unmatch "${f#$ROOT/}" >/dev/null 2>&1; then
                git -C "$ROOT" rm -q "${f#$ROOT/}"
            else
                rm "$f"
            fi
            count_moved=$((count_moved + 1))
        done
        echo "  moved: docs/security/$SLUG-*.md -> docs/archive/$DATE/$SLUG/security.md"
        break
    fi
done
shopt -u nullglob

if [ "$failed" -gt 0 ]; then
    echo "archive: $failed conflict(s). Bundle at $BUNDLE is partially populated; resolve conflicts and re-run." >&2
    exit 1
fi

if [ "$count_moved" = "0" ]; then
    # Nothing to archive — remove the empty bundle dir we created.
    rmdir "$BUNDLE" 2>/dev/null || true
    rmdir "$ROOT/docs/archive/$DATE" 2>/dev/null || true
    rmdir "$ROOT/docs/archive" 2>/dev/null || true
    echo "archive: nothing to archive for slug '$SLUG'"
    exit 0
fi

echo "archive: OK — $count_moved artifact(s) moved to ${BUNDLE#$ROOT/}"
