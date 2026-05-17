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
  for f in landmarks libraries decisions landmines conventions pending-questions backlog; do
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

# --- Phase 10.6 (memory-flush-phase) regression traps -------------------------
# Confirms sweep.py stays scoped to canonical files and does not touch _pending.md
# regardless of whether _pending.md body is empty (the fast-path case).

PENDING_SKELETON='---
owners: [memory_stop.sh writes; /memory-flush clears]
category: auto-extracted candidates awaiting curation
verifies-against: none
---

# Pending memory candidates

Auto-extracted by `memory_stop.sh`. Run `/memory-flush` to review.

**Content of this file is gitignored.**

---
'

seed_pending_skeleton() {
  printf '%s' "$PENDING_SKELETON" > "$1/_pending.md"
}

test_when_pending_empty_then_sweep_does_not_touch_pending() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  seed_pending_skeleton "$mem"
  local before; before="$(cat "$mem/_pending.md")"
  sweep auto-close "$mem" >/dev/null || { fail "sweep crashed on empty pending"; return 1; }
  sweep prose-scan "$mem" "" >/dev/null || { fail "sweep crashed on empty pending"; return 1; }
  sweep stale-sweep "$mem" "" >/dev/null || { fail "sweep crashed on empty pending"; return 1; }
  local after; after="$(cat "$mem/_pending.md")"
  if [ "$before" = "$after" ]; then return 0; fi
  fail "_pending.md mutated by sweep.py — sweep must stay scoped to canonical files"
  diff <(printf '%s' "$before") <(printf '%s' "$after") || true
  return 1
}

test_when_pending_empty_AND_q999_has_resolved_at_then_q999_is_swept() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  seed_pending_skeleton "$mem"
  add "$mem" "pending-questions" "## Q-999

- Question: fast-path canonical-sweep regression trap
- verified-at: HEAD
- last-touched: $(today)
- resolved-at: 2026-05-17"
  local report; report="$(sweep auto-close "$mem")" || { fail "sweep crashed"; return 1; }
  assert_file_not_contains "$mem/pending-questions.md" "## Q-999" "Q-999 must be auto-closed even when _pending.md is empty" || return 1
  assert_contains "$report" '"closed": 1' "expected closed count 1 (got: $report)" || return 1
}

# --- backlog-memory-bucket: routing + bootstrap + stale-exempt + verbatim ----
# Covers AC-005, AC-006, AC-007, AC-009, AC-011 from
# docs/specs/backlog-memory-bucket.md. All start RED until sweep.py adds
# 'backlog' to CANONICAL_FILES + STALE_EXEMPT_FILES, and README.md documents
# the new register.

test_when_promote_user_candidate_writes_canonical_entry_with_status_open_and_verbatim() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  # Curator-style entry: the shape /memory-flush would write on promotion.
  add "$mem" "backlog" "## add-retry-to-webhook-worker-3f2a

> verbatim (user, $(today)):
> TODO: add retry to webhook worker

- source: user-instruction
- status: open
- raised-on: $(today)
- raised-in-context: backlog-memory-bucket
- verified-at: HEAD
- last-touched: $(today)"
  # Auto-close should NOT touch this entry (no closure field present).
  local report; report="$(sweep auto-close "$mem")" || { fail "AC-005 sweep crashed"; return 1; }
  assert_file_contains "$mem/backlog.md" "## add-retry-to-webhook-worker-3f2a" "AC-005 open entry must survive auto-close" || return 1
  assert_file_contains "$mem/backlog.md" "status: open" "AC-005 status:open missing" || return 1
  assert_file_contains "$mem/backlog.md" "> verbatim (user," "AC-005 verbatim blockquote missing" || return 1
  assert_file_contains "$mem/backlog.md" "raised-on: $(today)" "AC-005 raised-on missing" || return 1
  assert_file_contains "$mem/backlog.md" "raised-in-context: backlog-memory-bucket" "AC-005 raised-in-context missing" || return 1
  assert_contains "$report" '"closed": 0' "AC-005 expected closed:0 (open entry shouldn't auto-close)" || return 1
}

test_when_bootstrap_entry_has_superseded_at_today_then_auto_close_removes_it() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "backlog" "## bootstrap

- source: inferred-from-code
- status: dropped
- raised-on: $(today)
- raised-in-context: backlog-memory-bucket
- verified-at: HEAD
- last-touched: $(today)
- superseded-at: $(today)"
  local report; report="$(sweep auto-close "$mem")" || { fail "AC-006 sweep crashed"; return 1; }
  assert_file_not_contains "$mem/backlog.md" "## bootstrap" "AC-006 bootstrap must be auto-closed" || return 1
  assert_contains "$report" '"closed": 1' "AC-006 expected closed:1 (got: $report)" || return 1
}

test_when_backlog_entry_verified_at_old_sha_then_not_classified_stale() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  # Non-git tempdir → stale predicate falls back to days-since(last-touched).
  # 120 days ago should be stale for any other canonical file; backlog must
  # be stale-exempt and NOT surface.
  add "$mem" "backlog" "## ancient-intent-aaaa

> verbatim (user, $(days_ago 120)):
> TODO: this is intentionally aged

- source: user-instruction
- status: open
- raised-on: $(days_ago 120)
- raised-in-context: legacy-workflow
- verified-at: HEAD
- last-touched: $(days_ago 120)"
  # stale-sweep reads one reply per surfaced entry from stdin; if backlog is
  # correctly stale-exempt, NO entry is surfaced and stdin is never consumed.
  local report; report="$(sweep stale-sweep "$mem" "")" || { fail "AC-009 sweep crashed"; return 1; }
  assert_file_contains "$mem/backlog.md" "## ancient-intent-aaaa" "AC-009 backlog entry must survive stale-sweep" || return 1
  assert_contains "$report" '"reverified": 0' "AC-009 expected reverified:0 (entry never surfaced)" || return 1
  assert_contains "$report" '"deleted": 0' "AC-009 expected deleted:0" || return 1
  assert_contains "$report" '"mark_closed": 0' "AC-009 expected mark_closed:0" || return 1
  assert_contains "$report" '"kept": 0' "AC-009 expected kept:0 (kept counts a surfaced entry that was skipped — backlog should never surface)" || return 1
}

test_when_readme_documents_backlog_and_assistant_deferral_then_present() {
  # Asserts the LIVE README.md (which the implement worker edits) — not a
  # fixture. Covers AC-007 schema-doc lockstep.
  local readme="$REPO_ROOT/.claude/memory/README.md"
  [ -f "$readme" ] || { fail "AC-007 README missing at $readme"; return 1; }
  assert_file_contains "$readme" "backlog.md" "AC-007 README missing backlog.md mention" || return 1
  assert_file_contains "$readme" "assistant-deferral" "AC-007 README missing assistant-deferral provenance value" || return 1
  # backlog.md should be listed under both the Files table and the stable-key
  # table; greedy substring matches the row prefix.
  local backlog_rows; backlog_rows="$(grep -cE '^\|\s*`backlog\.md`' "$readme" 2>/dev/null || true)"
  [ -z "$backlog_rows" ] && backlog_rows=0
  if [ "$backlog_rows" -lt 2 ]; then
    fail "AC-007 expected backlog.md row in BOTH Files table and stable-key table (>=2 rows); got $backlog_rows"
    return 1
  fi
}

# --- workflow-loop-closing-hygiene: stamp-closure mode (Goal 3) --------------
# Covers AC-005, AC-006, AC-007, AC-008 from
# docs/specs/workflow-loop-closing-hygiene.md. All start RED until sweep.py
# adds `mode_stamp_closure` + `--backlog-keys` arg + a 4th MODE_DISPATCH entry.

# Reuse the existing `sweep` helper for stamp-closure: pass a 4th positional
# argument forwarding the --backlog-keys CSV. The current helper signature
# `sweep mode mem replies` — we extend behavior with a sibling invoker so the
# existing call sites stay untouched.
sweep_stamp_closure() {
  local mem="$1" keys="${2:-}"
  if [ ! -f "$SWEEP" ]; then
    echo "{\"error\":\"sweep.py missing\"}"
    return 127
  fi
  python3 "$SWEEP" --mode stamp-closure --memory-dir "$mem" --backlog-keys "$keys"
}

# Add a backlog entry shaped like the canonical write from /memory-flush.
add_open_backlog_entry() {
  local mem="$1" key="$2"
  add "$mem" "backlog" "## $key

> verbatim (user, $(today)):
> stub intent line for $key

- source: user-instruction
- status: open
- raised-on: $(today)
- raised-in-context: test-fixture
- verified-at: HEAD
- last-touched: $(today)"
}

test_when_stamp_closure_runs_then_status_and_superseded_at_set() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add_open_backlog_entry "$mem" "k1"
  add_open_backlog_entry "$mem" "k2"
  add_open_backlog_entry "$mem" "k3"
  local report; report="$(sweep_stamp_closure "$mem" "k1,k2")" \
    || { fail "AC-005 sweep crashed (got: $report)"; return 1; }
  assert_contains "$report" '"stamped": 2' "AC-005 expected stamped:2 (got: $report)" || return 1
  # k1 and k2 must now carry status: picked-up + superseded-at: today.
  # k3 must remain status: open (no superseded-at:).
  python3 - "$mem/backlog.md" "$(today)" <<'PY' || return 1
import re, sys
path, today = sys.argv[1], sys.argv[2]
text = open(path).read()
def find(key):
    m = re.search(rf'^## {re.escape(key)}$(.*?)(?=^## |\Z)', text, re.M | re.DOTALL)
    return m.group(1) if m else ''
for key in ("k1", "k2"):
    block = find(key)
    if not block:
        sys.exit(f"missing block for {key}")
    if 'status: picked-up' not in block:
        sys.exit(f"{key}: expected status: picked-up; got: {block!r}")
    if f'superseded-at: {today}' not in block:
        sys.exit(f"{key}: expected superseded-at: {today}; got: {block!r}")
k3 = find("k3")
if 'status: open' not in k3:
    sys.exit(f"k3: expected status: open (untouched); got: {k3!r}")
if 'superseded-at:' in k3:
    sys.exit(f"k3: expected NO superseded-at: (untouched); got: {k3!r}")
PY
}

test_when_stamp_closure_then_auto_close_deletes() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add_open_backlog_entry "$mem" "k1"
  add_open_backlog_entry "$mem" "k2"
  sweep_stamp_closure "$mem" "k1,k2" >/dev/null \
    || { fail "AC-007 stamp-closure crashed"; return 1; }
  local report; report="$(sweep auto-close "$mem")" \
    || { fail "AC-007 auto-close crashed"; return 1; }
  assert_file_not_contains "$mem/backlog.md" "## k1" "AC-007 expected k1 deleted by auto-close" || return 1
  assert_file_not_contains "$mem/backlog.md" "## k2" "AC-007 expected k2 deleted by auto-close" || return 1
  assert_contains "$report" '"closed": 2' "AC-007 expected closed:2 (got: $report)" || return 1
}

test_when_stamp_closure_with_empty_keys_then_zero_stamped() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add_open_backlog_entry "$mem" "k1"
  local before; before="$(cat "$mem/backlog.md")"
  local report; report="$(sweep_stamp_closure "$mem" "")" \
    || { fail "AC-008 sweep crashed on empty keys"; return 1; }
  assert_contains "$report" '"stamped": 0' "AC-008 expected stamped:0 (got: $report)" || return 1
  local after; after="$(cat "$mem/backlog.md")"
  if [ "$before" = "$after" ]; then return 0; fi
  fail "AC-008 backlog.md was modified despite empty keys"
  diff <(printf '%s' "$before") <(printf '%s' "$after") || true
  return 1
}

test_when_stamp_closure_with_nonexistent_key_then_missing_list() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add_open_backlog_entry "$mem" "k1"
  local report; report="$(sweep_stamp_closure "$mem" "nonexistent-key")" \
    || { fail "AC-008 sweep crashed (got: $report)"; return 1; }
  assert_contains "$report" '"stamped": 0' "AC-008 expected stamped:0 for missing key" || return 1
  assert_contains "$report" '"missing"' "AC-008 expected missing list in report (got: $report)" || return 1
  assert_contains "$report" 'nonexistent-key' "AC-008 expected key in missing list" || return 1
}

test_when_stamp_closure_called_twice_then_idempotent() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add_open_backlog_entry "$mem" "k1"
  sweep_stamp_closure "$mem" "k1" >/dev/null \
    || { fail "AC-005 first stamp crashed"; return 1; }
  sweep_stamp_closure "$mem" "k1" >/dev/null \
    || { fail "AC-005 second stamp crashed"; return 1; }
  # status: picked-up should appear exactly once; superseded-at: today exactly once.
  local picked_count; picked_count="$(grep -c 'status: picked-up' "$mem/backlog.md")"
  local sup_count; sup_count="$(grep -c "superseded-at: $(today)" "$mem/backlog.md")"
  if [ "$picked_count" -ne 1 ] || [ "$sup_count" -ne 1 ]; then
    fail "AC-005 idempotency violated: status-count=$picked_count, superseded-count=$sup_count (expected 1, 1)"
    return 1
  fi
}

test_when_stamp_closure_missing_keys_arg_then_argparse_error() {
  if [ ! -f "$SWEEP" ]; then
    fail "AC-005 sweep.py missing"
    return 1
  fi
  python3 "$SWEEP" --mode stamp-closure --memory-dir "$REPO_ROOT/.claude/memory" >/dev/null 2>&1
  local ec=$?
  if [ "$ec" -ne 2 ]; then
    fail "AC-005 expected argparse exit 2 when --backlog-keys missing, got $ec"
    return 1
  fi
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
run test_when_pending_empty_then_sweep_does_not_touch_pending
run test_when_pending_empty_AND_q999_has_resolved_at_then_q999_is_swept

# backlog-memory-bucket coverage
run test_when_promote_user_candidate_writes_canonical_entry_with_status_open_and_verbatim
run test_when_bootstrap_entry_has_superseded_at_today_then_auto_close_removes_it
run test_when_backlog_entry_verified_at_old_sha_then_not_classified_stale
run test_when_readme_documents_backlog_and_assistant_deferral_then_present

# workflow-loop-closing-hygiene: stamp-closure coverage
run test_when_stamp_closure_runs_then_status_and_superseded_at_set
run test_when_stamp_closure_then_auto_close_deletes
run test_when_stamp_closure_with_empty_keys_then_zero_stamped
run test_when_stamp_closure_with_nonexistent_key_then_missing_list
run test_when_stamp_closure_called_twice_then_idempotent
run test_when_stamp_closure_missing_keys_arg_then_argparse_error

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
