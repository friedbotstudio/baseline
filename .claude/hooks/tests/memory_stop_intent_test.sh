#!/usr/bin/env bash
# Fixture-based integration tests for memory_stop.sh intent-extraction surface.
# Covers AC-001..AC-004, AC-010, AC-012 from docs/specs/backlog-memory-bucket.md
#
# Each test builds a synthetic transcript JSONL under a tempdir + project root,
# invokes the real hook with CLAUDE_PROJECT_DIR redirected at the tempdir, and
# asserts on the resulting _pending.md body. The hook is a passive collector —
# tests assert on what it APPENDED, not on side effects elsewhere.
#
# All tests in this file start RED until the implement worker:
#   (a) captures the no-intent baseline fixture at
#       .claude/hooks/tests/fixtures/memory_stop_landmark_baseline.txt
#       by running the CURRENT (pre-extension) hook against the AC-004 input;
#   (b) extends memory_stop.sh with the intent-extraction surface;
#   (c) re-runs this file — AC-001/2/3/10 should now PASS (extension added)
#       and AC-004/12 should stay PASS (baseline still matches because the
#       no-intent path is byte-stable).

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
HOOK="$REPO_ROOT/.claude/hooks/memory_stop.mjs"
HOOK_RUNNER="node"
FIXTURES="$HERE/fixtures"
LANDMARK_BASELINE="$FIXTURES/memory_stop_landmark_baseline.txt"

PASS=0; FAIL=0; FAILED=()

# --- assertion helpers (Foundation) ------------------------------------------

fail() { echo "  FAIL: $*"; return 1; }

assert_file_contains() {
  local path="$1" needle="$2" msg="$3"
  if grep -qF -- "$needle" "$path" 2>/dev/null; then return 0; fi
  fail "$msg :: $path missing literal: $needle"
}

assert_file_not_contains() {
  local path="$1" needle="$2" msg="$3"
  if grep -qF -- "$needle" "$path" 2>/dev/null; then
    fail "$msg :: $path should NOT contain literal: $needle"
    return 1
  fi
}

assert_grep_count() {
  local path="$1" pattern="$2" expected="$3" msg="$4"
  local got
  got="$(grep -cE "$pattern" "$path" 2>/dev/null || true)"
  [ -z "$got" ] && got=0
  if [ "$got" -eq "$expected" ]; then return 0; fi
  fail "$msg :: pattern /$pattern/ count expected=$expected got=$got"
}

# --- transcript builders (Foundation) ----------------------------------------

# Each builder appends one JSONL event. Event shape matches what Claude Code
# writes to a real transcript: {"message": {"role": ..., "content": [...]}}.

append_text_event() {
  local path="$1" role="$2" text="$3"
  EVENT_PATH="$path" EVENT_ROLE="$role" EVENT_TEXT="$text" node --input-type=module -e '
import { appendFileSync } from "node:fs";
const event = { message: { role: process.env.EVENT_ROLE,
  content: [{ type: "text", text: process.env.EVENT_TEXT }] } };
appendFileSync(process.env.EVENT_PATH, JSON.stringify(event) + "\n", "utf8");
'
}

append_tool_use_event() {
  local path="$1" tool="$2" file_path="$3"
  EVENT_PATH="$path" EVENT_TOOL="$tool" EVENT_FILE="$file_path" node --input-type=module -e '
import { appendFileSync } from "node:fs";
const event = { message: { role: "assistant",
  content: [{ type: "tool_use", name: process.env.EVENT_TOOL,
              input: { file_path: process.env.EVENT_FILE } }] } };
appendFileSync(process.env.EVENT_PATH, JSON.stringify(event) + "\n", "utf8");
'
}

# --- project root setup (Foundation) -----------------------------------------

# Seed a tempdir with the layout memory_stop.sh expects:
#   <root>/.claude/hooks/lib/      symlink to the real lib (for common.sh)
#   <root>/.claude/memory/_pending.md   skeleton body
#   <root>/.claude/state/logs/     empty (log_line writes here)
# Prints the root path on stdout.
seed_project() {
  local root; root="$(mktemp -d)"
  mkdir -p "$root/.claude/memory" "$root/.claude/state/logs" "$root/.claude/hooks"
  ln -s "$REPO_ROOT/.claude/hooks/lib" "$root/.claude/hooks/lib"
  cat > "$root/.claude/memory/_pending.md" <<'EOF'
---
owners: [memory_stop.sh writes; /memory-flush clears]
category: auto-extracted candidates awaiting curation
verifies-against: none
---

# Pending memory candidates

---
EOF
  printf '%s' "$root"
}

# Invoke the hook against $1 = project root, $2 = transcript path.
# The hook is invoked exactly as Claude Code invokes it — JSON payload on
# stdin, project dir via env. Output to stdout/stderr is suppressed; tests
# inspect _pending.md afterward.
run_hook() {
  local root="$1" transcript="$2"
  printf '%s' "{\"transcript_path\":\"$transcript\"}" \
    | CLAUDE_PROJECT_DIR="$root" $HOOK_RUNNER "$HOOK" >/dev/null 2>&1 || true
}

# Helper: read the pending file path for a given project root.
pending_path() {
  printf '%s' "$1/.claude/memory/_pending.md"
}

# Strip lines that legitimately vary between runs (session timestamps + edit
# timestamps), so byte-parity comparisons are stable across invocations.
canonicalize_pending() {
  grep -vE '^<!-- session [0-9TZ:-]+ -->$|^- Source: file written/edited at ' "$1"
}

run() {
  local name="$1"
  echo "RUN  $name"
  if "$name"; then
    PASS=$((PASS+1)); echo "PASS $name"
  else
    FAIL=$((FAIL+1)); FAILED+=("$name"); echo "FAIL $name"
  fi
}

# --- AC-001: user-prompt anchored TODO emits backlog candidate ---------------

test_when_user_prompt_has_anchored_todo_then_backlog_candidate_emitted() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "user" "TODO: add retry to webhook worker"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 1 "AC-001 expected exactly 1 backlog CANDIDATE" || return 1
  assert_file_contains "$pf" "- Role: user" "AC-001 role=user missing" || return 1
  assert_file_contains "$pf" "- Source: user-instruction" "AC-001 source=user-instruction missing" || return 1
  assert_file_contains "$pf" "TODO: add retry to webhook worker" "AC-001 verbatim missing" || return 1

  # Key shape: <slug>-<4-char-hash>
  local key
  key="$(grep -oE '^## CANDIDATE: backlog → \S+' "$pf" | head -1 | sed 's|^## CANDIDATE: backlog → ||')"
  echo "$key" | grep -qE -- '-[0-9a-f]{4}$' || { fail "AC-001 key '$key' missing 4-char hash suffix"; return 1; }
}

# --- AC-002: assistant-text anchored intent emits candidate with distinct source ---

test_when_assistant_text_has_anchored_lets_also_then_backlog_candidate_with_assistant_deferral_source() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "assistant" "Let's also test the empty-state flow"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 1 "AC-002 expected exactly 1 backlog CANDIDATE" || return 1
  assert_file_contains "$pf" "- Role: assistant" "AC-002 role=assistant missing" || return 1
  assert_file_contains "$pf" "- Source: assistant-deferral" "AC-002 source=assistant-deferral missing" || return 1
  assert_file_contains "$pf" "Let's also test the empty-state flow" "AC-002 verbatim missing" || return 1
}

# --- AC-003: mid-sentence trigger MUST NOT emit ------------------------------

test_when_intent_mid_sentence_then_no_backlog_candidate() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "user" "we discussed the next section of the document is here and TODO appears mid-line"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 0 "AC-003 mid-sentence MUST NOT emit candidate" || return 1
}

# --- AC-003 noise filter: system-reminder block suppressed -------------------

test_when_intent_in_system_reminder_block_then_no_backlog_candidate() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "user" $'<system-reminder>\nTODO: should be filtered\n</system-reminder>'
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 0 "AC-003 system-reminder block MUST be filtered" || return 1
}

# --- AC-001 bullet anchor: indented bullet emits -----------------------------

test_when_intent_at_indented_bullet_then_candidate_emitted() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "user" $'Some intro line.\n  - TODO: handle the empty-state case'
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 1 "AC-001 bullet-anchored intent should emit 1" || return 1
  assert_file_contains "$pf" "TODO: handle the empty-state case" "AC-001 bullet verbatim missing" || return 1
}

# --- AC-001 zero-content guard: empty intent after trigger strip -------------

test_when_intent_text_empty_after_trigger_strip_then_no_candidate() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "user" "TODO:"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 0 "AC-001 zero-content intent MUST NOT emit" || return 1
}

# --- AC-010: same 8-word prefix → distinct keys via hash suffix --------------

test_when_two_intents_same_8word_prefix_then_distinct_keys() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "user" "next we should add retry logic"
  append_text_event "$tx" "user" "next we should add retry tests"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 2 "AC-010 expected 2 distinct backlog candidates" || return 1

  # Both keys present and distinct
  local keys
  keys="$(grep -oE '^## CANDIDATE: backlog → \S+' "$pf" | sort -u)"
  local count; count="$(printf '%s\n' "$keys" | wc -l | tr -d ' ')"
  [ "$count" -eq 2 ] || { fail "AC-010 expected 2 distinct keys; got $count :: $keys"; return 1; }
}

# --- AC-001/AC-002 dedup: same intent repeated in turn -----------------------

test_when_same_intent_repeated_in_turn_then_within_session_dedup_holds() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  # Same intent: 2 user events + 1 assistant event = 2 distinct candidates
  # (one per role-source combination).
  append_text_event "$tx" "user" "TODO: dedup me please"
  append_text_event "$tx" "user" "TODO: dedup me please"
  append_text_event "$tx" "assistant" "TODO: dedup me please"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 2 "expected 2 (one per role); got drift" || return 1
  assert_grep_count "$pf" '^- Source: user-instruction' 1 "expected 1 user-instruction candidate" || return 1
  assert_grep_count "$pf" '^- Source: assistant-deferral' 1 "expected 1 assistant-deferral candidate" || return 1
}

# --- AC-004 byte-parity: file-touch path unchanged ---------------------------
# Post-#6: landmark candidates emit only when (Write fires on the path) OR
# (edit count >= LANDMARK_EDIT_MIN). The original input (2 edits foo + 1
# edit bar) no longer qualifies. Bumped to 3 edits per file so both meet
# the threshold and the byte-equality assertion still exercises the
# emission path. See test_when_two_edits_only_then_no_landmark_candidate
# below for the explicit below-threshold regression trap.

test_when_turn_edits_files_no_intent_then_landmark_candidates_byte_identical() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_tool_use_event "$tx" "Edit" "src/foo.py"
  append_tool_use_event "$tx" "Edit" "src/bar.py"
  append_tool_use_event "$tx" "Edit" "src/foo.py"
  append_tool_use_event "$tx" "Edit" "src/bar.py"
  append_tool_use_event "$tx" "Edit" "src/foo.py"
  append_tool_use_event "$tx" "Edit" "src/bar.py"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  if [ ! -f "$LANDMARK_BASELINE" ]; then
    fail "AC-004 baseline fixture missing at $LANDMARK_BASELINE — implement worker must capture pre-extension output before adding intent extraction"
    return 1
  fi

  # Backlog section MUST be empty for this input (no intent text)
  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 0 "AC-004 no-intent input must produce zero backlog candidates" || return 1

  # Canonicalized (timestamp-stripped) output MUST byte-match the baseline.
  local actual_canon expected_canon
  actual_canon="$(canonicalize_pending "$pf")"
  expected_canon="$(canonicalize_pending "$LANDMARK_BASELINE")"
  if [ "$actual_canon" = "$expected_canon" ]; then return 0; fi
  fail "AC-004 landmark output diverged from baseline (canonicalized diff below)"
  diff <(printf '%s' "$expected_canon") <(printf '%s' "$actual_canon") | head -30
  return 1
}

# --- #7 widened intent triggers (corpus regression trap) ---------------------
# Each new pattern below is a representative true-positive from this repo's
# backlog verbatims / archive bundles that the original 6-pattern set missed.
# Together they form the precision-favoring corpus: each line MUST fire when
# anchored at start-of-line; mid-sentence forms MUST NOT fire (see the
# negative cases at the bottom).

test_when_widened_we_need_to_then_backlog_candidate_emitted() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "assistant" "we need to migrate the auth layer to the new session store"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"
  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 1 "#7 'we need to' should emit (got: $(grep -c 'CANDIDATE: backlog' "$pf"))" || return 1
  assert_file_contains "$pf" "migrate the auth layer" "#7 'we need to' verbatim should carry the action" || return 1
}

test_when_widened_cure_label_then_backlog_candidate_emitted() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "assistant" "Cure: write-to-temp-then-rename pattern for atomic workflow.json writes"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"
  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 1 "#7 'Cure:' should emit" || return 1
  assert_file_contains "$pf" "write-to-temp-then-rename" "#7 'Cure:' verbatim should carry the solution" || return 1
}

test_when_widened_follow_up_label_then_backlog_candidate_emitted() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "user" "follow-up: harden stripFrontmatter against body horizontal rules"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"
  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 1 "#7 'follow-up' should emit" || return 1
}

test_when_widened_future_work_label_then_backlog_candidate_emitted() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "assistant" "Future work: add backlog-decay sweep to the memory-flush SOP"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"
  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 1 "#7 'Future work' should emit" || return 1
}

test_when_widened_numbered_action_then_backlog_candidate_emitted() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  # Numbered action lists are common in spec / RCA prose. Each item starts
  # with `N. <verb>` and describes future work.
  append_text_event "$tx" "user" $'Plan:\n1. Refactor the workflow migrator to use atomic writes\n2. Add the regression test'
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"
  # Both items match (different verbs); allow >= 1.
  local got; got="$(grep -c '^## CANDIDATE: backlog → ' "$pf" 2>/dev/null || echo 0)"
  if [ "$got" -lt 1 ]; then
    fail "#7 numbered-action 'N. Refactor X' should emit; got $got"
    return 1
  fi
}

# --- #7 precision: mid-sentence widened triggers MUST NOT fire ---------------

test_when_widened_we_need_to_mid_sentence_then_no_candidate() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  # `we need to` appears mid-sentence; anchor must reject.
  append_text_event "$tx" "user" "we discussed why we need to ship this — it's about velocity"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"
  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 0 "#7 mid-sentence 'we need to' MUST NOT emit" || return 1
}

test_when_widened_cure_mid_sentence_then_no_candidate() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  append_text_event "$tx" "assistant" "the cure should also touch upstream caching, but that's separate"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"
  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 0 "#7 mid-sentence 'cure' MUST NOT emit" || return 1
}

# --- Edit-only threshold: below-threshold Edits suppress candidate -----------

test_when_two_edits_only_then_no_landmark_candidate() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  # 2 edits to the same file: edit count below LANDMARK_EDIT_MIN (3), no Write.
  # Pre-#6 behavior would emit a candidate; post-#6 must suppress.
  append_tool_use_event "$tx" "Edit" "src/borderline.py"
  append_tool_use_event "$tx" "Edit" "src/borderline.py"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  assert_grep_count "$pf" '^## CANDIDATE: src/borderline.py' 0 "below-threshold (2 edits, no Write) MUST NOT emit landmark candidate" || return 1
}

# --- Write-event bypass: Write always emits regardless of edit count ---------

test_when_single_write_then_landmark_candidate_emitted() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  # Single Write event: bypasses edit-threshold (brand-new file is interesting
  # regardless of edit count).
  append_tool_use_event "$tx" "Write" "src/brandnew.py"
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  assert_grep_count "$pf" '^## CANDIDATE: src/brandnew.py → landmarks.md' 1 "single Write MUST emit landmark candidate" || return 1
  assert_file_contains "$pf" "newly written this session" "Write candidate should carry the 'newly written' Trigger label" || return 1
  assert_file_contains "$pf" "- source: inferred-from-code" "landmark candidate should carry source: inferred-from-code (#8)" || return 1
}

# --- AC-012 regression trap: no-intent leaves backlog section unchanged ------

test_when_no_intent_text_in_turn_then_backlog_section_byte_identical_to_pre_change() {
  local root; root="$(seed_project)"; trap "rm -rf $root" RETURN
  local tx="$root/transcript.jsonl"
  # Pure text content, no intent triggers. Hook should produce ZERO backlog
  # candidates and leave the rest of _pending.md byte-stable.
  append_text_event "$tx" "user" "general question about how the system works"
  append_text_event "$tx" "assistant" "Here is a long explanation with no future-intent triggers in it."
  run_hook "$root" "$tx"
  local pf; pf="$(pending_path "$root")"

  assert_grep_count "$pf" '^## CANDIDATE: backlog → ' 0 "AC-012 no-intent input must produce zero backlog candidates" || return 1
  # Body below the front-matter separator should remain the skeleton form
  # (no CANDIDATE blocks of any kind, since there are no file edits either).
  assert_grep_count "$pf" '^## CANDIDATE:' 0 "AC-012 expected zero CANDIDATE blocks for pure text/no-edits turn" || return 1
}

# --- runner ------------------------------------------------------------------

run test_when_user_prompt_has_anchored_todo_then_backlog_candidate_emitted
run test_when_assistant_text_has_anchored_lets_also_then_backlog_candidate_with_assistant_deferral_source
run test_when_intent_mid_sentence_then_no_backlog_candidate
run test_when_intent_in_system_reminder_block_then_no_backlog_candidate
run test_when_intent_at_indented_bullet_then_candidate_emitted
run test_when_intent_text_empty_after_trigger_strip_then_no_candidate
run test_when_two_intents_same_8word_prefix_then_distinct_keys
run test_when_same_intent_repeated_in_turn_then_within_session_dedup_holds
run test_when_turn_edits_files_no_intent_then_landmark_candidates_byte_identical
run test_when_two_edits_only_then_no_landmark_candidate
run test_when_single_write_then_landmark_candidate_emitted
run test_when_widened_we_need_to_then_backlog_candidate_emitted
run test_when_widened_cure_label_then_backlog_candidate_emitted
run test_when_widened_follow_up_label_then_backlog_candidate_emitted
run test_when_widened_future_work_label_then_backlog_candidate_emitted
run test_when_widened_numbered_action_then_backlog_candidate_emitted
run test_when_widened_we_need_to_mid_sentence_then_no_candidate
run test_when_widened_cure_mid_sentence_then_no_candidate
run test_when_no_intent_text_in_turn_then_backlog_section_byte_identical_to_pre_change

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
