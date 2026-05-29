// Regression test for the cross-invocation dedup bug in
// .claude/hooks/lib/memory_stop.mjs. The pre-fix regex captured only the
// path token before ` → target.md`, so the lookup-side key (which DOES
// include the arrow + target) never matched the existing-key set.
// Effect: every Stop event re-appended the same landmark/library/backlog
// candidates, producing visible duplicate session blocks in _pending.md.
//
// This file invokes the real hook twice in sequence — once seeded with
// _pending.md skeleton, once seeded with the first run's output — and
// asserts the second run does NOT append duplicate candidates.

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
  const root = mkdtempSync(join(tmpdir(), 'mem-stop-dedup-'));
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

function appendEditEvent(transcriptPath, filePath, tool = 'Edit') {
  const event = {
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', name: tool, input: { file_path: filePath } }],
    },
  };
  appendFileSync(transcriptPath, JSON.stringify(event) + '\n');
}

function runHook(root, transcript) {
  return spawnSync('node', [HOOK_PATH], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root },
    input: JSON.stringify({ transcript_path: transcript }),
    encoding: 'utf8',
  });
}

function candidateLines(pendingBody) {
  return pendingBody.split('\n').filter((ln) => ln.startsWith('## CANDIDATE: '));
}

describe('memory_stop cross-invocation dedup', () => {
  it('does not re-append landmark candidates when run twice on equivalent transcripts', () => {
    const root = seedProject();
    try {
      // Use Write events so threshold (#6) doesn't suppress emission — the
      // test is about dedup, not the edit-count threshold.
      const t1 = join(root, 't1.jsonl');
      appendEditEvent(t1, 'src/foo.py', 'Write');
      appendEditEvent(t1, 'src/bar.py', 'Write');
      const r1 = runHook(root, t1);
      assert.equal(r1.status, 0, `first hook run failed: ${r1.stderr}`);

      const pendingAfter1 = readFileSync(join(root, '.claude/memory/_pending.md'), 'utf8');
      const cand1 = candidateLines(pendingAfter1);
      assert.equal(cand1.length, 2, `first run should emit 2 landmark candidates; got ${cand1.length}\n${pendingAfter1}`);
      assert.ok(cand1.some((l) => l.includes('src/foo.py → landmarks.md')), 'first run missing src/foo.py candidate');
      assert.ok(cand1.some((l) => l.includes('src/bar.py → landmarks.md')), 'first run missing src/bar.py candidate');

      const t2 = join(root, 't2.jsonl');
      appendEditEvent(t2, 'src/foo.py', 'Write');
      appendEditEvent(t2, 'src/bar.py', 'Write');
      const r2 = runHook(root, t2);
      assert.equal(r2.status, 0, `second hook run failed: ${r2.stderr}`);

      const pendingAfter2 = readFileSync(join(root, '.claude/memory/_pending.md'), 'utf8');
      const cand2 = candidateLines(pendingAfter2);
      assert.equal(
        cand2.length,
        2,
        `second run must not re-append duplicate landmark candidates; expected 2 total, got ${cand2.length}\n--- pending after run 2 ---\n${pendingAfter2}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not re-append backlog candidates when the same intent recurs across runs', () => {
    const root = seedProject();
    try {
      const t1 = join(root, 't1.jsonl');
      appendTextEvent(t1, 'user', 'TODO: add retry to webhook worker');
      const r1 = runHook(root, t1);
      assert.equal(r1.status, 0, `first hook run failed: ${r1.stderr}`);

      const after1 = readFileSync(join(root, '.claude/memory/_pending.md'), 'utf8');
      const cand1 = candidateLines(after1).filter((l) => l.includes('backlog → '));
      assert.equal(cand1.length, 1, `first run should emit 1 backlog candidate; got ${cand1.length}`);

      const t2 = join(root, 't2.jsonl');
      appendTextEvent(t2, 'user', 'TODO: add retry to webhook worker');
      const r2 = runHook(root, t2);
      assert.equal(r2.status, 0, `second hook run failed: ${r2.stderr}`);

      const after2 = readFileSync(join(root, '.claude/memory/_pending.md'), 'utf8');
      const cand2 = candidateLines(after2).filter((l) => l.includes('backlog → '));
      assert.equal(
        cand2.length,
        1,
        `second run must not re-append same-intent backlog candidate; expected 1 total, got ${cand2.length}\n--- pending after run 2 ---\n${after2}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
