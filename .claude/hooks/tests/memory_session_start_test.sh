#!/usr/bin/env bash
# Fixture-based integration tests for memory_session_start.sh
# Covers AC-003, AC-005, AC-007, AC-008 from docs/specs/memory-lifecycle-closure.md
#
# Each test builds a synthetic .claude/memory/ tree under a tempdir, invokes
# the hook with PROJECT_ROOT pointed at that tempdir, and asserts on the
# emitted additionalContext JSON.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
HOOK="$REPO_ROOT/.claude/hooks/memory_session_start.sh"
FIXTURES="$HERE/fixtures"

PASS=0; FAIL=0; FAILED=()

# --- assertion helpers --------------------------------------------------------

fail() { echo "  FAIL: $*"; return 1; }

assert_contains() {
  local haystack="$1" needle="$2" msg="$3"
  case "$haystack" in
    *"$needle"*) return 0 ;;
    *) fail "$msg :: expected to contain: $needle" ;;
  esac
}

assert_not_contains() {
  local haystack="$1" needle="$2" msg="$3"
  case "$haystack" in
    *"$needle"*) fail "$msg :: should NOT contain: $needle" ;;
    *) return 0 ;;
  esac
}

# Run the hook against a project root. $1 = project root containing .claude/memory/.
# Prints the parsed additionalContext to stdout. Returns 1 if hook crashed.
run_hook() {
  local proj="$1"
  CLAUDE_PROJECT_DIR="$proj" \
    bash "$HOOK" <<< '{}' 2>/dev/null | python3 -c '
import json, sys
data = sys.stdin.read().strip()
if not data:
    sys.exit(2)
j = json.loads(data)
print(j["hookSpecificOutput"]["additionalContext"])
'
}

# Build a minimal synthetic memory tree. $1 = root.
seed_tree() {
  local root="$1"
  mkdir -p "$root/.claude/memory" "$root/.claude/state/harness"
  # Frontmatter-only files so hook reports 0 entries unless we add ## blocks.
  for f in landmarks libraries decisions landmines conventions pending-questions; do
    cat > "$root/.claude/memory/$f.md" <<'EOF'
---
owners: [test]
size-cap: 500
key: test
---

# Test fixture
EOF
  done
  # Minimal _pending.md so the hook does not emit the nag by accident.
  cat > "$root/.claude/memory/_pending.md" <<'EOF'
---
owners: [test]
---

# Pending
EOF
}

# Add an entry block to a canonical file. $1 root, $2 file basename, $3 entry body.
add_entry() {
  local root="$1" file="$2"; shift 2
  printf '\n%s\n' "$*" >> "$root/.claude/memory/$file.md"
}

# Compute an ISO date N days ago (portable: GNU or BSD date).
days_ago() {
  local n="$1"
  if date -u -d "$n days ago" +%Y-%m-%d 2>/dev/null; then return; fi
  date -u -v "-${n}d" +%Y-%m-%d
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

# --- tests --------------------------------------------------------------------

test_when_7_entries_stale_then_top_5_listed_oldest_first() {
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf $tmp" RETURN
  seed_tree "$tmp"
  # 7 entries across 3 files with ages 100/95/90/50/40/30/5 days, no closure fields.
  local i=0
  for spec in "landmarks:lm-a:100" "landmarks:lm-b:95" "libraries:lib-a:90" \
              "libraries:lib-b:50" "decisions:dec-a:40" "decisions:dec-b:30" \
              "conventions:conv-a:5"; do
    local file="${spec%%:*}" key key_age age
    key="$(echo "$spec" | cut -d: -f2)"
    age="${spec##*:}"
    add_entry "$tmp" "$file" "## $key

- role: test
- verified-at: HEAD
- last-touched: $(days_ago "$age")"
    i=$((i+1))
  done
  local out; out="$(run_hook "$tmp")"
  assert_contains "$out" "## Stale entries" "AC-003 stale block missing" || return 1
  # The 5 oldest by last-touched are 100/95/90/50/40 → lm-a lm-b lib-a lib-b dec-a.
  for k in lm-a lm-b lib-a lib-b dec-a; do
    assert_contains "$out" "$k" "AC-003 expected key $k in stale block" || return 1
  done
  # 30-day-old entry IS stale (>=30 day threshold for non-git), but only top 5 listed.
  # conv-a (5 days) is not stale; should be absent from the block.
  # With 6 stale entries total, the 6th (dec-b) should appear via overflow.
  assert_contains "$out" "and 1 more" "AC-003 overflow indicator missing" || return 1
  assert_not_contains "$out" "## conv-a" "AC-003 non-stale should not appear in block" || return 1
}

test_when_8_stale_then_overflow_indicator_shows_3_more() {
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf $tmp" RETURN
  seed_tree "$tmp"
  # 8 stale entries, ages 200..130 by 10s.
  local i=0
  for age in 200 190 180 170 160 150 140 130; do
    add_entry "$tmp" "landmarks" "## ent-$i

- role: test
- verified-at: HEAD
- last-touched: $(days_ago "$age")"
    i=$((i+1))
  done
  local out; out="$(run_hook "$tmp")"
  assert_contains "$out" "## Stale entries" "AC-003 stale block missing" || return 1
  assert_contains "$out" "and 3 more" "AC-003 expected overflow '… and 3 more'" || return 1
}

test_when_5_stale_with_identical_last_touched_then_alphabetical_by_file_colon_key() {
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf $tmp" RETURN
  seed_tree "$tmp"
  local d; d="$(days_ago 120)"
  # Place entries across files in non-alphabetical insertion order; expect
  # alphabetical-by-file:key in the rendered block.
  add_entry "$tmp" "landmines" "## zeta

- role: test
- verified-at: HEAD
- last-touched: $d"
  add_entry "$tmp" "landmarks" "## alpha

- role: test
- verified-at: HEAD
- last-touched: $d"
  add_entry "$tmp" "decisions" "## kappa

- role: test
- verified-at: HEAD
- last-touched: $d"
  add_entry "$tmp" "libraries" "## beta

- role: test
- verified-at: HEAD
- last-touched: $d"
  add_entry "$tmp" "conventions" "## mu

- role: test
- verified-at: HEAD
- last-touched: $d"
  local out; out="$(run_hook "$tmp")"
  # Expected lexicographic order of "<file>:<key>":
  #   conventions:mu < decisions:kappa < landmarks:alpha < landmines:zeta < libraries:beta
  # Find the first appearance position of each key in the stale block.
  local block; block="$(printf '%s\n' "$out" | awk '/## Stale entries/{flag=1;next}/^## /{flag=0}flag')"
  local order; order="$(printf '%s\n' "$block" | grep -oE '(alpha|beta|kappa|mu|zeta)' | head -5 | tr '\n' ' ')"
  assert_contains " $order" " mu kappa alpha zeta beta " "AC-003 alphabetical-by-file:key order wrong: got [$order]" || return 1
}

test_when_closure_field_and_stale_sha_then_not_counted_stale() {
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf $tmp" RETURN
  seed_tree "$tmp"
  # Entry stale by date but carries resolved-at on pending-questions → MUST be excluded.
  add_entry "$tmp" "pending-questions" "## Q-999

- Question: stub
- verified-at: HEAD
- last-touched: $(days_ago 200)
- resolved-at: $(days_ago 1)"
  # Plus a normal stale entry on landmarks (no closure) → still counted.
  add_entry "$tmp" "landmarks" "## still-open

- role: test
- verified-at: HEAD
- last-touched: $(days_ago 200)"
  local out; out="$(run_hook "$tmp")"
  assert_not_contains "$out" "Q-999" "AC-005 closed entry must not appear in stale block" || return 1
  # Header count must be 1, not 2.
  if printf '%s\n' "$out" | grep -qE 'stale \(>=30 commits old\): 1\b'; then :; else
    fail "AC-005 expected stale count 1 in header"
    return 1
  fi
  assert_contains "$out" "still-open" "AC-005 sanity: unclosed stale entry should appear" || return 1
}

test_when_audit_runs_against_changed_repo_then_exit_0() {
  ( cd "$REPO_ROOT" && bash .claude/skills/audit-baseline/audit.sh >/dev/null 2>&1 ) \
    || { fail "AC-007 audit exited non-zero"; return 1; }
}

test_when_hook_runs_unchanged_tree_then_header_and_table_byte_equal() {
  # Run hook against the real repo memory tree and compare header+table to
  # the captured pre-spec reference. The fixture's HEAD field is the literal
  # sentinel `n/a` (see fixtures/regenerate-ac008.sh); the test normalizes
  # any captured `HEAD: \`<short-sha>\`` to `HEAD: \`n/a\`` before comparing
  # so the test is byte-stable across commits.
  local out; out="$(run_hook "$REPO_ROOT")"
  local actual_block
  actual_block="$(printf '%s\n' "$out" | python3 -c '
import re, sys
HEAD_RE = re.compile(r"^(HEAD:\s*`)[^`]+(`)")
lines = sys.stdin.read().split("\n")
started = False
out = []
for ln in lines:
    if ln.startswith("## Project memory"):
        started = True
    if not started:
        continue
    out.append(HEAD_RE.sub(r"\1n/a\2", ln))
    if ln.startswith("| `pending-questions.md`"):
        break
sys.stdout.write("\n".join(out) + "\n")
')"
  local expected; expected="$(cat "$FIXTURES/ac008_byte_equal_reference.txt")"
  if [ "$actual_block" = "$expected" ]; then return 0; fi
  fail "AC-008 header+table not byte-equal"
  diff <(printf '%s' "$expected") <(printf '%s' "$actual_block") || true
  return 1
}

test_when_old_resume_snapshot_reinjected_then_hook_does_not_crash() {
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf $tmp" RETURN
  seed_tree "$tmp"
  # Old _resume.md from a pre-spec session — minimal body, no new index format.
  cat > "$tmp/.claude/memory/_resume.md" <<'EOF'
---
written_at: 2026-04-30T12:00:00Z
---

# Resume snapshot (legacy)
Last phase: spec
EOF
  local out
  out="$(run_hook "$tmp")" || { fail "AC-008 hook crashed on legacy _resume"; return 1; }
  assert_contains "$out" "## Project memory" "AC-008 expected index header still present" || return 1
  assert_contains "$out" "Resume snapshot (legacy)" "AC-008 legacy body should be appended" || return 1
}

# --- runner -------------------------------------------------------------------

run test_when_7_entries_stale_then_top_5_listed_oldest_first
run test_when_8_stale_then_overflow_indicator_shows_3_more
run test_when_5_stale_with_identical_last_touched_then_alphabetical_by_file_colon_key
run test_when_closure_field_and_stale_sha_then_not_counted_stale
run test_when_audit_runs_against_changed_repo_then_exit_0
run test_when_hook_runs_unchanged_tree_then_header_and_table_byte_equal
run test_when_old_resume_snapshot_reinjected_then_hook_does_not_crash

echo "----"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED[@]}"; do echo "  - $t"; done
fi
exit $((FAIL > 0))
