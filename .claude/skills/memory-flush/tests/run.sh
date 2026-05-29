#!/usr/bin/env bash
# Fixture-based integration tests for the memory-flush Step 0 SOP.
# Covers AC-001, AC-002, AC-004, AC-006 from docs/specs/memory-lifecycle-closure.md
#
# The SKILL.md SOP is markdown; the executable contract lives in
# `.claude/skills/memory-flush/sweep.mjs`, a deterministic helper the SOP
# invokes for the sweep-and-classify portion of Step 0. Each test builds a
# stubbed memory tree, invokes sweep.mjs with a stubbed reply stream, and
# asserts on the resulting file state + JSON action report.
#
# Until sweep.mjs exists, every flush test fails RED (correct TDD state).
# AC-006 regression-traps stay green from day one and must stay green.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
SWEEP="$REPO_ROOT/.claude/skills/memory-flush/sweep.mjs"

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

# Invoke sweep.mjs against a fixture memory dir.
#   $1 = mode (auto-close | prose-scan | stale-sweep)
#   $2 = memory dir
#   $3 = reply stream (newline-separated; piped to stdin)
# Stdout = JSON report from sweep.mjs; exit 0 success, non-zero error.
sweep() {
  local mode="$1" mem="$2" replies="${3:-}"
  if [ ! -f "$SWEEP" ]; then
    echo "{\"error\":\"sweep.mjs missing\"}"
    return 127
  fi
  printf '%s' "$replies" | node "$SWEEP" --mode "$mode" --memory-dir "$mem"
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
# Confirms sweep.mjs stays scoped to canonical files and does not touch _pending.md
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
  fail "_pending.md mutated by sweep.mjs — sweep must stay scoped to canonical files"
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
# docs/specs/backlog-memory-bucket.md. All start RED until sweep.mjs adds
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
# docs/specs/workflow-loop-closing-hygiene.md. All start RED until sweep.mjs
# adds `mode_stamp_closure` + `--backlog-keys` arg + a 4th MODE_DISPATCH entry.

# Reuse the existing `sweep` helper for stamp-closure: pass a 4th positional
# argument forwarding the --backlog-keys CSV. The current helper signature
# `sweep mode mem replies` — we extend behavior with a sibling invoker so the
# existing call sites stay untouched.
sweep_stamp_closure() {
  local mem="$1" keys="${2:-}"
  if [ ! -f "$SWEEP" ]; then
    echo "{\"error\":\"sweep.mjs missing\"}"
    return 127
  fi
  node "$SWEEP" --mode stamp-closure --memory-dir "$mem" --backlog-keys "$keys"
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
  BACKLOG_PATH="$mem/backlog.md" TODAY_ISO="$(today)" node --input-type=module -e '
import { readFileSync } from "node:fs";
const path = process.env.BACKLOG_PATH;
const today = process.env.TODAY_ISO;
const text = readFileSync(path, "utf8");
const find = (key) => {
  const re = new RegExp(`^## ${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m");
  const m = text.match(re);
  return m ? m[1] : "";
};
for (const key of ["k1", "k2"]) {
  const block = find(key);
  if (!block) { console.error(`missing block for ${key}`); process.exit(1); }
  if (!block.includes("status: picked-up")) { console.error(`${key}: expected status: picked-up; got: ${JSON.stringify(block)}`); process.exit(1); }
  if (!block.includes(`superseded-at: ${today}`)) { console.error(`${key}: expected superseded-at: ${today}; got: ${JSON.stringify(block)}`); process.exit(1); }
}
const k3 = find("k3");
if (!k3.includes("status: open")) { console.error(`k3: expected status: open (untouched); got: ${JSON.stringify(k3)}`); process.exit(1); }
if (k3.includes("superseded-at:")) { console.error(`k3: expected NO superseded-at: (untouched); got: ${JSON.stringify(k3)}`); process.exit(1); }
' || return 1
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
    fail "AC-005 sweep.mjs missing"
    return 1
  fi
  node "$SWEEP" --mode stamp-closure --memory-dir "$REPO_ROOT/.claude/memory" >/dev/null 2>&1
  local ec=$?
  if [ "$ec" -ne 2 ]; then
    fail "AC-005 expected argparse exit 2 when --backlog-keys missing, got $ec"
    return 1
  fi
}

# --- heading-suffix closure: "## <key> — CLOSED YYYY-MM-DD" -----------------
# Pending-questions entries in this repo close via heading suffix instead of
# the structured `resolved-at:` field. The auto-close + prose patterns
# documented in README catch the structured form only; these tests pin the
# extended detection that handles the suffix form too.

test_when_pending_q_has_closed_heading_em_dash_then_auto_close_removes_block() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "pending-questions" "## Q-500 — CLOSED 2026-05-01

- Resolution: decided in spec
- verified-at: HEAD
- last-touched: $(today)"
  local report; report="$(sweep auto-close "$mem")" || { fail "sweep crashed"; return 1; }
  assert_file_not_contains "$mem/pending-questions.md" "## Q-500" "Q-500 em-dash CLOSED heading must auto-close" || return 1
  assert_contains "$report" '"closed": 1' "expected closed:1 (got: $report)" || return 1
}

test_when_pending_q_has_closed_heading_ascii_dash_then_auto_close_removes_block() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "pending-questions" "## Q-501 -- CLOSED 2026-05-02

- Resolution: settled via review
- verified-at: HEAD
- last-touched: $(today)"
  local report; report="$(sweep auto-close "$mem")" || { fail "sweep crashed"; return 1; }
  assert_file_not_contains "$mem/pending-questions.md" "## Q-501" "Q-501 ASCII-dash CLOSED heading must auto-close" || return 1
  assert_contains "$report" '"closed": 1' "expected closed:1 (got: $report)" || return 1
}

test_when_landmarks_has_closed_heading_then_auto_close_removes_block() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add "$mem" "landmarks" "## src/legacy.js:1 — CLOSED 2026-05-10

- role: legacy entrypoint
- verified-at: HEAD
- last-touched: $(today)"
  local report; report="$(sweep auto-close "$mem")" || { fail "sweep crashed"; return 1; }
  assert_file_not_contains "$mem/landmarks.md" "## src/legacy.js:1" "landmark CLOSED heading must auto-close (superseded-at semantics)" || return 1
  assert_contains "$report" '"closed": 1' "expected closed:1 (got: $report)" || return 1
}

test_when_closed_heading_date_malformed_then_block_kept() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  # 2026-13-99 is malformed (month 13, day 99). validIso must reject.
  add "$mem" "pending-questions" "## Q-502 — CLOSED 2026-13-99

- Resolution: bad date should not delete
- verified-at: HEAD
- last-touched: $(today)"
  local report; report="$(sweep auto-close "$mem")" || { fail "sweep crashed on malformed heading date"; return 1; }
  assert_file_contains "$mem/pending-questions.md" "## Q-502" "malformed heading date must NOT delete entry" || return 1
  assert_contains "$report" '"malformed":' "expected malformed flag in report (got: $report)" || return 1
}

test_when_resolution_bullet_prose_then_surfaced_for_confirm() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  # No heading-suffix closure; only the body bullet pattern. R4 should match.
  add "$mem" "pending-questions" "## Q-503

- Question: stub
- Resolution: settled in spec — kept for historical reference
- verified-at: HEAD
- last-touched: $(today)"
  local report; report="$(sweep prose-scan "$mem" "y")" || { fail "sweep crashed"; return 1; }
  assert_file_not_contains "$mem/pending-questions.md" "## Q-503" "R4 '- Resolution:' bullet must surface and delete on 'y'" || return 1
  assert_contains "$report" '"closed_by_confirm": 1' "expected closed_by_confirm:1 (got: $report)" || return 1
}

# --- Step 0d backlog-decay --------------------------------------------------
# Backlog is stale-exempt under the default predicate but unbounded growth
# still erodes the file. The `backlog-decay` mode applies an age-based decay
# on `raised-on:` (or `last-touched:` fallback) and prompts the curator per
# entry.

sweep_backlog_decay() {
  local mem="$1" replies="${2:-}" days="${3:-}"
  if [ ! -f "$SWEEP" ]; then
    echo "{\"error\":\"sweep.mjs missing\"}"
    return 127
  fi
  if [ -n "$days" ]; then
    printf '%s' "$replies" | node "$SWEEP" --mode backlog-decay --memory-dir "$mem" --threshold-days "$days"
  else
    printf '%s' "$replies" | node "$SWEEP" --mode backlog-decay --memory-dir "$mem"
  fi
}

add_aged_backlog_entry() {
  local mem="$1" key="$2" age="$3"
  add "$mem" "backlog" "## $key

> verbatim (user, $(days_ago "$age")):
> stub aged intent

- source: user-instruction
- status: open
- raised-on: $(days_ago "$age")
- raised-in-context: test
- verified-at: HEAD
- last-touched: $(days_ago "$age")"
}

test_when_backlog_entry_older_than_default_threshold_then_surfaces_and_drop_marks_superseded() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add_aged_backlog_entry "$mem" "old-intent-a" 120
  add_aged_backlog_entry "$mem" "recent-intent-b" 30
  local report; report="$(sweep_backlog_decay "$mem" "drop")" || { fail "sweep crashed"; return 1; }
  assert_contains "$report" '"surfaced": 1' "expected surfaced:1 (only old entry crosses 90-day default; got: $report)" || return 1
  assert_contains "$report" '"dropped": 1' "expected dropped:1 (got: $report)" || return 1
  assert_file_contains "$mem/backlog.md" "status: dropped" "drop reply must write status: dropped" || return 1
  assert_file_contains "$mem/backlog.md" "superseded-at: $(today)" "drop reply must stamp superseded-at" || return 1
  # The recent entry must remain untouched.
  assert_file_contains "$mem/backlog.md" "## recent-intent-b" "30-day-old entry must NOT surface under default 90-day threshold" || return 1
}

test_when_backlog_decay_reply_keep_then_refreshes_last_touched() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add_aged_backlog_entry "$mem" "old-intent-c" 120
  sweep_backlog_decay "$mem" "keep" >/dev/null || { fail "sweep crashed"; return 1; }
  assert_file_contains "$mem/backlog.md" "## old-intent-c" "keep reply must leave the entry in place" || return 1
  assert_file_contains "$mem/backlog.md" "last-touched: $(today)" "keep reply must refresh last-touched to today" || return 1
  assert_file_not_contains "$mem/backlog.md" "superseded-at:" "keep reply must NOT stamp superseded-at" || return 1
}

test_when_backlog_decay_reply_picked_up_then_stamps_status_and_superseded() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add_aged_backlog_entry "$mem" "old-intent-d" 120
  sweep_backlog_decay "$mem" "picked-up" >/dev/null || { fail "sweep crashed"; return 1; }
  assert_file_contains "$mem/backlog.md" "status: picked-up" "picked-up reply must write status: picked-up" || return 1
  assert_file_contains "$mem/backlog.md" "superseded-at: $(today)" "picked-up reply must stamp superseded-at" || return 1
}

test_when_backlog_decay_threshold_lowered_then_more_entries_surface() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  add_aged_backlog_entry "$mem" "intent-50d" 50
  add_aged_backlog_entry "$mem" "intent-15d" 15
  local report; report="$(sweep_backlog_decay "$mem" "skip" 30)" || { fail "sweep crashed"; return 1; }
  assert_contains "$report" '"surfaced": 1' "with --threshold-days 30, only the 50-day entry should surface (got: $report)" || return 1
}

test_when_backlog_decay_entry_already_closed_then_not_surfaced() {
  local mem; mem="$(mktemp -d)"; trap "rm -rf $mem" RETURN
  seed_skel "$mem"
  # Entry already carries superseded-at — Step 0a auto-close territory; this
  # mode must skip it.
  add "$mem" "backlog" "## already-closed

- source: user-instruction
- status: dropped
- raised-on: $(days_ago 120)
- verified-at: HEAD
- last-touched: $(days_ago 120)
- superseded-at: $(today)"
  local report; report="$(sweep_backlog_decay "$mem" "")" || { fail "sweep crashed"; return 1; }
  assert_contains "$report" '"surfaced": 0' "closed entries must NOT surface in backlog-decay (got: $report)" || return 1
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

# --- `verified-at: HEAD` no longer evades decay on git repos -----------------
# Pre-fix: stale predicate short-circuited to "fresh" when stamp === 'HEAD' on
# git repos (because the `head !== ''` branch fell through to `return false`).
# That let entries written without an actual SHA persist forever. Post-fix:
# HEAD falls through to the date-based check regardless of git-ness, so old
# `last-touched` correctly marks the entry stale on both git AND non-git.

# sweep.mjs derives the project root as dirname(dirname(memdir)). To exercise
# the git path we need .claude/memory/ to sit two directories deep inside a
# real git working tree. This helper builds that layout.
seed_skel_git() {
  local root; root="$(mktemp -d)"
  local mem="$root/.claude/memory"
  mkdir -p "$mem"
  git -C "$root" init -q -b main 2>/dev/null
  git -C "$root" -c user.email=t@t -c user.name=t commit --allow-empty -q -m "seed" 2>/dev/null
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
  printf '%s' "$root"
}

test_when_git_repo_verified_at_HEAD_with_old_last_touched_then_stale() {
  local root; root="$(seed_skel_git)"; trap "rm -rf $root" RETURN
  local mem="$root/.claude/memory"
  add "$mem" "conventions" "## old-convention-HEAD-stamp

- pattern: legacy convention not refreshed in a long time
- verified-at: HEAD
- last-touched: $(days_ago 120)"
  local report; report="$(sweep stale-sweep "$mem" "delete")" || { fail "sweep crashed"; return 1; }
  assert_file_not_contains "$mem/conventions.md" "## old-convention-HEAD-stamp" "git+HEAD-stamp+old last-touched must surface and be deletable (regression on HEAD escape hatch)" || return 1
  assert_contains "$report" '"deleted": 1' "expected deleted:1 (got: $report)" || return 1
}

test_when_git_repo_verified_at_HEAD_with_fresh_last_touched_then_not_stale() {
  local root; root="$(seed_skel_git)"; trap "rm -rf $root" RETURN
  local mem="$root/.claude/memory"
  add "$mem" "conventions" "## fresh-convention-HEAD-stamp

- pattern: just refreshed
- verified-at: HEAD
- last-touched: $(today)"
  local report; report="$(sweep stale-sweep "$mem" "")" || { fail "sweep crashed"; return 1; }
  assert_file_contains "$mem/conventions.md" "## fresh-convention-HEAD-stamp" "fresh HEAD-stamped entry must NOT surface" || return 1
  assert_contains "$report" '"deleted": 0' "expected deleted:0 for fresh entry (got: $report)" || return 1
}

test_when_git_repo_verified_at_real_sha_within_threshold_then_not_stale() {
  # Sanity trap: a fresh stamp (current short SHA) on a git repo must NOT
  # surface, so my fix doesn't accidentally over-stale entries with real SHAs.
  local root; root="$(seed_skel_git)"; trap "rm -rf $root" RETURN
  local mem="$root/.claude/memory"
  local sha; sha="$(git -C "$root" rev-parse --short HEAD)"
  add "$mem" "conventions" "## fresh-sha-stamp

- pattern: verified against current HEAD
- verified-at: $sha
- last-touched: $(today)"
  local report; report="$(sweep stale-sweep "$mem" "")" || { fail "sweep crashed"; return 1; }
  assert_file_contains "$mem/conventions.md" "## fresh-sha-stamp" "current-HEAD SHA stamp must NOT surface" || return 1
  assert_contains "$report" '"deleted": 0' "expected deleted:0 for current-SHA entry (got: $report)" || return 1
}

# heading-suffix closure + R4 prose pattern (Phase 0a/0b extensions)
run test_when_pending_q_has_closed_heading_em_dash_then_auto_close_removes_block
run test_when_pending_q_has_closed_heading_ascii_dash_then_auto_close_removes_block
run test_when_landmarks_has_closed_heading_then_auto_close_removes_block
run test_when_closed_heading_date_malformed_then_block_kept
run test_when_resolution_bullet_prose_then_surfaced_for_confirm

# HEAD escape-hatch closed
run test_when_git_repo_verified_at_HEAD_with_old_last_touched_then_stale
run test_when_git_repo_verified_at_HEAD_with_fresh_last_touched_then_not_stale
run test_when_git_repo_verified_at_real_sha_within_threshold_then_not_stale

# Step 0d backlog-decay
run test_when_backlog_entry_older_than_default_threshold_then_surfaces_and_drop_marks_superseded
run test_when_backlog_decay_reply_keep_then_refreshes_last_touched
run test_when_backlog_decay_reply_picked_up_then_stamps_status_and_superseded
run test_when_backlog_decay_threshold_lowered_then_more_entries_surface
run test_when_backlog_decay_entry_already_closed_then_not_surfaced

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
