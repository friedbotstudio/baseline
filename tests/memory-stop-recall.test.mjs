// Recall tests for the backlog-intent extractor in
// .claude/hooks/lib/memory_stop.mjs.
//
// The pre-extension matcher only fired on line-ANCHORED directive triggers
// (`^we need to`, `^backlog this`, ...). Real future-work intent that the user
// expresses with an INLINE routing marker — "(add to backlog)", "add this for
// backlog too", "...in the next session" — landed mid-line or end-of-line and
// was silently dropped. The corpus evidence lives in
// .claude/memory/backlog.md (the line-72 caveat documents its own misses).
//
// These tests assert the four documented corpus misses are now captured, that
// the marker phrase is stripped from the derived slug while the full line is
// preserved as the verbatim, and that the precision floor holds (the bare word
// "backlog" in descriptive past-tense prose is NOT a routing marker).
//
// Harness mirrors tests/memory-stop-dedup.test.mjs: mkdtemp project root,
// symlink the real lib, seed _pending.md skeleton, append JSONL transcript
// events, invoke the real hook via spawnSync with CLAUDE_PROJECT_DIR pointed at
// the tempdir, assert on the resulting _pending.md.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const HOOK_PATH = join(REPO_ROOT, '.claude/hooks/memory_stop.mjs');

const PENDING_SKELETON = `---
owners: [memory_stop.sh writes; /memory-flush clears]
category: auto-extracted candidates awaiting curation
verifies-against: none
---

# Pending memory candidates

---
`;

function seedProject() {
  const root = mkdtempSync(join(tmpdir(), 'mem-stop-recall-'));
  mkdirSync(join(root, '.claude/memory'), { recursive: true });
  mkdirSync(join(root, '.claude/state/logs'), { recursive: true });
  mkdirSync(join(root, '.claude/hooks'), { recursive: true });
  symlinkSync(join(REPO_ROOT, '.claude/hooks/lib'), join(root, '.claude/hooks/lib'));
  writeFileSync(join(root, '.claude/memory/_pending.md'), PENDING_SKELETON);
  return root;
}

function appendTextEvent(transcriptPath, role, text) {
  const event = { message: { role, content: [{ type: 'text', text }] } };
  appendFileSync(transcriptPath, JSON.stringify(event) + '\n');
}

function runHook(root, transcript) {
  return spawnSync('node', [HOOK_PATH], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root },
    input: JSON.stringify({ transcript_path: transcript }),
    encoding: 'utf8',
  });
}

// Run the hook against a single user text block and return the resulting
// _pending.md body. Foundation helper composed by every scenario below.
function captureUserIntent(text) {
  const root = seedProject();
  try {
    const t = join(root, 't.jsonl');
    appendTextEvent(t, 'user', text);
    const r = runHook(root, t);
    assert.equal(r.status, 0, `hook run failed: ${r.stderr}`);
    return readFileSync(join(root, '.claude/memory/_pending.md'), 'utf8');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function backlogHeaders(pendingBody) {
  return pendingBody
    .split('\n')
    .filter((ln) => ln.startsWith('## CANDIDATE: backlog → '));
}

function backlogSlug(header) {
  return header.replace('## CANDIDATE: backlog → ', '').trim();
}

function intentLine(pendingBody) {
  return pendingBody.split('\n').find((ln) => ln.startsWith('- Intent: ')) || '';
}

describe('memory_stop backlog-intent recall', () => {
  it('test_when_inline_add_to_backlog_marker_then_candidate_emitted', () => {
    const body = captureUserIntent('so, let us work on this feature in next session (add to backlog)');
    assert.ok(
      backlogHeaders(body).length >= 1,
      `inline "(add to backlog)" marker should produce a backlog candidate\n${body}`,
    );
  });

  it('test_when_add_this_for_backlog_too_then_candidate_emitted', () => {
    const body = captureUserIntent('can you summarize the spec and present me all the open questions (add this for backlog too)');
    assert.ok(
      backlogHeaders(body).length >= 1,
      `"add this for backlog too" marker should produce a backlog candidate\n${body}`,
    );
  });

  it('test_when_marker_stripped_from_slug_but_verbatim_preserved', () => {
    const line = 'fix the chunked upload race condition (add to backlog)';
    const body = captureUserIntent(line);
    const headers = backlogHeaders(body);
    assert.ok(headers.length >= 1, `expected a backlog candidate\n${body}`);
    const slug = backlogSlug(headers[0]);
    assert.ok(
      !/add|backlog/.test(slug),
      `slug must exclude the routing-marker tokens; got slug="${slug}"`,
    );
    assert.ok(
      slug.startsWith('fix-the-chunked-upload-race-condition'),
      `slug should derive from the intent payload; got slug="${slug}"`,
    );
    assert.ok(
      intentLine(body).includes('(add to backlog)'),
      `verbatim "- Intent:" line must preserve the full original text including the marker\n${body}`,
    );
  });

  it('test_when_next_session_deferral_then_candidate_emitted', () => {
    const body = captureUserIntent('revisit the chunked-upload retry path in the next session');
    assert.ok(
      backlogHeaders(body).length >= 1,
      `"in the next session" deferral marker should produce a backlog candidate\n${body}`,
    );
  });

  it('test_when_no_intent_transcript_then_no_new_candidate', () => {
    const body = captureUserIntent('I refactored the backlog item detection regex and it now passes');
    assert.equal(
      backlogHeaders(body).length,
      0,
      `the bare word "backlog" in descriptive past-tense prose is not a routing marker\n${body}`,
    );
  });

  it('test_when_marker_only_line_no_payload_then_no_candidate', () => {
    const body = captureUserIntent('backlog this');
    assert.equal(
      backlogHeaders(body).length,
      0,
      `a marker-only line with no residual payload yields no derivable slug\n${body}`,
    );
  });

  it('test_when_pathological_long_marker_line_then_bounded_time_and_candidate', () => {
    // ReDoS regression guard (CWE-1333). A crafted line matching a marker at the
    // very end, after a long whitespace + non-completing "add " run, previously
    // drove MARKER_STRIP_GLOBAL into super-linear backtracking (~12s at 10KB,
    // >40s at 20KB). The fix bounds the strip input, so processing stays well
    // under the wall-clock bound below while a candidate is still emitted.
    const line = ' '.repeat(3000) + 'add '.repeat(3000) + 'to backlog';
    const root = seedProject();
    try {
      const t = join(root, 't.jsonl');
      appendTextEvent(t, 'user', line);
      const start = Date.now();
      const r = runHook(root, t);
      const elapsedMs = Date.now() - start;
      assert.equal(r.status, 0, `hook run failed: ${r.stderr}`);
      assert.ok(
        elapsedMs < 8000,
        `hook must process a pathological marker line in bounded time; took ${elapsedMs}ms`,
      );
      const body = readFileSync(join(root, '.claude/memory/_pending.md'), 'utf8');
      assert.ok(
        backlogHeaders(body).length >= 1,
        `a bounded candidate should still be emitted from the long marker line\n${body.slice(0, 400)}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
