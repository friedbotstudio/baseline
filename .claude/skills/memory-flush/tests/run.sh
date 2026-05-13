#!/usr/bin/env bash
# Fixture-based integration tests for the memory-flush Step 0 SOP.
# Covers AC-001, AC-002, AC-004, AC-006 from docs/specs/memory-lifecycle-closure.md
#
# The SKILL.md SOP is markdown; the executable contract lives in
# `.claude/skills/memory-flush/sweep.py`, a deterministic helper the SOP
# invokes for the sweep-and-classify portion of Step 0. Each test builds a
# stubbed memory tree, invokes sweep.py with a stubbed reply stream, and
# asserts on the resulting file state + JSON action report.
#
# Until sweep.py exists, every flush test fails RED (correct TDD state).
# AC-006 regression-traps stay green from day one and must stay green.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
SWEEP="$REPO_ROOT/.claude/skills/memory-flush/sweep.py"

PASS=0; FAIL=0; FAILED=()

# --- assertion helpers --------------------------------------------------------

fail() { echo "  FAIL: $*"; return 1; }

assert_file_contains() {
  local path="$1" needle="$2" msg="$3"
  if grep -qF "$needle" "$path" 2>/dev/null; then return 0; fi
  fail "$msg :: file $path missing: $needle"
}

assert_file_not_contains() {
  local path="$1" needle="$2" msg="$3"
  if grep -qF "$needle" "$path" 2>/dev/null; then
    fail "$msg :: file $path should NOT contain: $needle"
    return 1
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" msg="$3"
  case "$haystack" in
    *"$needle"*) return 0 ;;
    *) fail "$msg :: expected to contain: $needle" ;;
  esac
}

# Invoke sweep.py against a fixture memory dir.
#   $1 = mode (auto-close | prose-scan | stale-sweep)
#   $2 = memory dir
#   $3 = reply stream (newline-separated; piped to stdin)
# Stdout = JSON report from sweep.py; exit 0 success, non-zero error.
sweep() {
  local mode="$1" mem="$2" replies="${3:-}"
  if [ ! -x "$SWEEP" ] && [ ! -f "$SWEEP" ]; then
    echo "{\"error\":\"sweep.py missing\"}"
    return 127
  fi
  printf '%s' "$replies" | python3 "$SWEEP" --mode "$mode" --memory-dir "$mem"
}

seed_skel() {
  local mem="$1"
  mkdir -p "$mem"
  for f in landmarks libraries decisions landmines conventions pending-questions; do
    cat > "$mem/$f.md" <<EOF
---
owners: [test]
size-cap: 500
key: test
---

# Fixture
EOF
  done
}

# Append an entry block to a canonical file.
add() {
  local mem="$1" file="$2"; shift 2
  printf '\n%s\n' "$*" >> "$mem/$file.md"
}

days_ago() {
  local n="$1"
  if date -u -d "$n days ago" +%Y-%m-%d 2>/dev/null; then return; fi
  date -u -v "-${n}d" +%Y-%m-%d
}

today() { date -u +%Y-%m-%d; }

run() {
  local name="$1"
  echo "RUN  $name"
  if "$name"; then
    PASS=$((PASS+1)); echo "PASS $name"
  else
    FAIL=$((FAIL+1)); FAILED+=("$name"); echo "FAIL $name"
  fi
}

# --- AC-001 -------------------------------------------------------------------

test_when_resolved_at_present_on_pending_then_flush_removes_block() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "pending-questions" "## Q-100

- Question: stub
- verified-at: HEAD
- last-touched: $(today)
- resolved-at: 2026-05-01"
  local report; report="$(sweep auto-close "$mem")" || { fail "AC-001 sweep crashed"; return 1; }
  assert_file_not_contains "$mem/pending-questions.md" "## Q-100" "AC-001 expected Q-100 block removed" || return 1
  assert_contains "$report" '"closed": 1' "AC-001 expected closed count 1 in report (got: $report)" || return 1
}

test_when_superseded_at_present_on_landmarks_then_flush_removes_block() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "landmarks" "## src/old.js:42

- role: legacy entrypoint
- verified-at: HEAD
- last-touched: $(today)
- superseded-at: 2026-05-01"
  local report; report="$(sweep auto-close "$mem")" || { fail "AC-001 sweep crashed"; return 1; }
  assert_file_not_contains "$mem/landmarks.md" "## src/old.js:42" "AC-001 expected superseded block removed" || return 1
  assert_contains "$report" '"closed": 1' "AC-001 expected closed count 1 in report" || return 1
}

test_when_resolved_at_malformed_then_entry_remains_open() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "pending-questions" "## Q-200

- Question: stub
- verified-at: HEAD
- last-touched: $(today)
- resolved-at: 2026-13-99"
  local report; report="$(sweep auto-close "$mem")" || { fail "AC-001 sweep crashed on malformed"; return 1; }
  assert_file_contains "$mem/pending-questions.md" "## Q-200" "AC-001 malformed date must NOT delete entry" || return 1
  assert_contains "$report" '"malformed":' "AC-001 expected malformed flag in report" || return 1
}

test_when_resolved_at_on_wrong_file_then_skill_flags_violation() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  # resolved-at on landmarks.md is a per-file invariant violation.
  add "$mem" "landmarks" "## src/x.js:1

- role: test
- verified-at: HEAD
- last-touched: $(today)
- resolved-at: 2026-05-01"
  local report; report="$(sweep auto-close "$mem")" || { fail "AC-001 sweep crashed"; return 1; }
  assert_file_contains "$mem/landmarks.md" "## src/x.js:1" "AC-001 invariant-violation entry must NOT be deleted" || return 1
  assert_contains "$report" '"invariant_violation":' "AC-001 expected invariant_violation flag in report" || return 1
}

# --- AC-002 -------------------------------------------------------------------

test_when_pending_entry_has_resolution_prose_and_y_then_block_removed() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "pending-questions" "## Q-300

- Question: stub
**Resolution path taken (2026-04-29):** decided in spec.
- verified-at: HEAD
- last-touched: $(today)"
  # Reply stream: 'y' to confirm removal.
  local report; report="$(sweep prose-scan "$mem" "y")" || { fail "AC-002 sweep crashed"; return 1; }
  assert_file_not_contains "$mem/pending-questions.md" "## Q-300" "AC-002 'y' must delete block" || return 1
  assert_contains "$report" '"closed_by_confirm": 1' "AC-002 expected closed_by_confirm 1 (got: $report)" || return 1

  # 'n' keeps the entry.
  rm -rf "$mem"; mem="$(mktemp -d)"; seed_skel "$mem"
  add "$mem" "pending-questions" "## Q-301

- Question: stub
**Resolution path taken (2026-04-29):** decided in spec.
- verified-at: HEAD
- last-touched: $(today)"
  sweep prose-scan "$mem" "n" >/dev/null || { fail "AC-002 sweep crashed on 'n'"; return 1; }
  assert_file_contains "$mem/pending-questions.md" "## Q-301" "AC-002 'n' must keep block" || return 1

  # 'skip' keeps the entry and marks for next-run reconsideration.
  rm -rf "$mem"; mem="$(mktemp -d)"; seed_skel "$mem"
  add "$mem" "pending-questions" "## Q-302

- Question: stub
**Resolution path taken (2026-04-29):** decided.
- verified-at: HEAD
- last-touched: $(today)"
  report="$(sweep prose-scan "$mem" "skip")"
  assert_file_contains "$mem/pending-questions.md" "## Q-302" "AC-002 'skip' must keep block" || return 1
  assert_contains "$report" '"deferred":' "AC-002 'skip' should produce deferred marker" || return 1
}

test_when_body_has_resolved_by_alice_anchored_then_surfaced() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "pending-questions" "## Q-310

- Question: who decides
Resolved by Alice 2026-05-01
- verified-at: HEAD
- last-touched: $(today)"
  local report; report="$(sweep prose-scan "$mem" "y")" || { fail "AC-002 sweep crashed"; return 1; }
  assert_file_not_contains "$mem/pending-questions.md" "## Q-310" "AC-002 R3 anchored should surface and delete on 'y'" || return 1
  assert_contains "$report" '"closed_by_confirm": 1' "AC-002 expected closed_by_confirm 1" || return 1
}

test_when_body_has_resolved_midsentence_then_not_surfaced() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "pending-questions" "## Q-320

- Question: we resolved most of this last week but still need a date.
- verified-at: HEAD
- last-touched: $(today)"
  # No replies; if a prompt surfaces unexpectedly the sweep will hang or pick a default.
  local report; report="$(sweep prose-scan "$mem" "")" || { fail "AC-002 sweep crashed"; return 1; }
  assert_file_contains "$mem/pending-questions.md" "## Q-320" "AC-002 mid-sentence must NOT surface" || return 1
  assert_contains "$report" '"surfaced": 0' "AC-002 expected surfaced 0 for mid-sentence (got: $report)" || return 1
}

# --- AC-004 -------------------------------------------------------------------

test_when_2_stale_then_flush_offers_reverify_then_delete_prompts() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "landmarks" "## src/keep.js:1

- role: test
- verified-at: HEAD
- last-touched: $(days_ago 120)"
  add "$mem" "landmarks" "## src/drop.js:1

- role: test
- verified-at: HEAD
- last-touched: $(days_ago 130)"
  # Replies: re-verify (keep+restamp) then delete.
  local report; report="$(sweep stale-sweep "$mem" "re-verify
delete")" || { fail "AC-004 sweep crashed"; return 1; }
  # First entry kept with refreshed last-touched.
  assert_file_contains "$mem/landmarks.md" "## src/keep.js:1" "AC-004 reverify must keep" || return 1
  assert_file_contains "$mem/landmarks.md" "last-touched: $(today)" "AC-004 reverify must restamp last-touched" || return 1
  # Second entry deleted.
  assert_file_not_contains "$mem/landmarks.md" "## src/drop.js:1" "AC-004 delete must remove" || return 1
  assert_contains "$report" '"reverified": 1' "AC-004 expected reverified 1" || return 1
  assert_contains "$report" '"deleted": 1' "AC-004 expected deleted 1" || return 1
}

test_when_stale_mark_closed_on_pending_then_resolved_at_added_not_deleted() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "pending-questions" "## Q-400

- Question: stub
- verified-at: HEAD
- last-touched: $(days_ago 120)"
  sweep stale-sweep "$mem" "mark-closed" >/dev/null || { fail "AC-004 sweep crashed"; return 1; }
  assert_file_contains "$mem/pending-questions.md" "## Q-400" "AC-004 mark-closed must NOT delete this run" || return 1
  assert_file_contains "$mem/pending-questions.md" "resolved-at:" "AC-004 mark-closed must add resolved-at on pending-questions" || return 1
}

# --- AC-006 (regression traps — start green, stay green) ----------------------

test_when_no_closure_no_prose_no_stale_then_entry_survives_all_paths() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "landmarks" "## src/normal.js:1

- role: ordinary entry, no closure, no prose match
- verified-at: HEAD
- last-touched: $(today)"
  local before; before="$(cat "$mem/landmarks.md")"
  # Step 0a auto-close.
  sweep auto-close "$mem" >/dev/null
  # Step 0b prose-scan with no replies (nothing should be surfaced).
  sweep prose-scan "$mem" "" >/dev/null
  # Step 0c stale-sweep (entry is not stale; nothing to do).
  sweep stale-sweep "$mem" "" >/dev/null
  local after; after="$(cat "$mem/landmarks.md")"
  if [ "$before" = "$after" ]; then return 0; fi
  fail "AC-006 entry mutated through Step 0 a/b/c"
  diff <(printf '%s' "$before") <(printf '%s' "$after") || true
  return 1
}

test_when_pre_spec_entry_no_source_no_verbatim_then_grandfathered() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  # Legacy shape: no `source:`, no `verbatim:` block.
  add "$mem" "conventions" "## legacy-entry

- pattern: legacy
- verified-at: HEAD
- last-touched: $(today)"
  sweep auto-close "$mem" >/dev/null || { fail "AC-006 sweep crashed"; return 1; }
  sweep prose-scan "$mem" "" >/dev/null
  assert_file_contains "$mem/conventions.md" "## legacy-entry" "AC-006 grandfathered legacy entry survives" || return 1
}

# --- runner -------------------------------------------------------------------

run test_when_resolved_at_present_on_pending_then_flush_removes_block
run test_when_superseded_at_present_on_landmarks_then_flush_removes_block
run test_when_resolved_at_malformed_then_entry_remains_open
run test_when_resolved_at_on_wrong_file_then_skill_flags_violation
run test_when_pending_entry_has_resolution_prose_and_y_then_block_removed
run test_when_body_has_resolved_by_alice_anchored_then_surfaced
run test_when_body_has_resolved_midsentence_then_not_surfaced
run test_when_2_stale_then_flush_offers_reverify_then_delete_prompts
run test_when_stale_mark_closed_on_pending_then_resolved_at_added_not_deleted
run test_when_no_closure_no_prose_no_stale_then_entry_survives_all_paths
run test_when_pre_spec_entry_no_source_no_verbatim_then_grandfathered

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
