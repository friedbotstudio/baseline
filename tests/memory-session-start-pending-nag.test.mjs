// Tests for the #9 expansion of the pending-candidates nag in
// .claude/hooks/lib/memory_session_start.mjs. Pre-#9 the nag fired only
// when no workflow.json existed. Post-#9 it fires in both cases with
// distinct framings, advisory only — never blocking.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const HOOK_PATH = join(REPO_ROOT, '.claude/hooks/memory_session_start.mjs');

const FRONTMATTER = `---
owners: [test]
size-cap: 500
key: test
---

# Test fixture
`;

function seedTree() {
  const root = mkdtempSync(join(tmpdir(), 'mem-pending-nag-'));
  mkdirSync(join(root, '.claude/memory'), { recursive: true });
  mkdirSync(join(root, '.claude/state/harness'), { recursive: true });
  for (const name of ['landmarks', 'libraries', 'decisions', 'landmines',
    'conventions', 'pending-questions', 'backlog']) {
    writeFileSync(join(root, '.claude/memory', `${name}.md`), FRONTMATTER);
  }
  return root;
}

function seedPending(root, candidateCount) {
  const blocks = Array.from({ length: candidateCount }, (_, i) =>
    `## CANDIDATE: src/file${i}.py → landmarks.md\n- field: value\n`,
  ).join('\n');
  writeFileSync(join(root, '.claude/memory/_pending.md'),
    `---\nowners: [test]\n---\n\n# Pending\n\n${blocks}`);
}

function seedActiveWorkflow(root) {
  writeFileSync(join(root, '.claude/state/workflow.json'),
    JSON.stringify({ slug: 'fixture-active', track_id: 'freeform', completed: [] }));
}

function runHook(root) {
  const r = spawnSync('node', [HOOK_PATH], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root },
    input: '{}',
    encoding: 'utf8',
  });
  if (!r.stdout || !r.stdout.trim()) return '';
  return JSON.parse(r.stdout)?.hookSpecificOutput?.additionalContext || '';
}

describe('memory_session_start — pending-candidates nag fires in both workflow states', () => {
  it('no workflow + pending > 0 → prior-workflow framing', () => {
    const root = seedTree();
    try {
      seedPending(root, 3);
      const out = runHook(root);
      assert.match(out, /carried over from a prior workflow/, 'expected prior-workflow framing when no workflow.json');
      assert.match(out, /3 pending memory candidate/, 'expected the count');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('active workflow + pending > 0 → current-session framing', () => {
    const root = seedTree();
    try {
      seedPending(root, 5);
      seedActiveWorkflow(root);
      const out = runHook(root);
      assert.match(out, /accumulated this session/, 'expected current-session framing during active workflow');
      assert.match(out, /Phase 10\.6.*memory-flush/, 'expected hint pointing at Phase 10.6');
      assert.match(out, /5 pending memory candidate/, 'expected the count');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('no pending → no nag in either workflow state', () => {
    const root = seedTree();
    try {
      writeFileSync(join(root, '.claude/memory/_pending.md'),
        '---\nowners: [test]\n---\n\n# Pending\n');
      const out1 = runHook(root);
      assert.doesNotMatch(out1, /pending memory candidate/, 'no nag when pending is empty (no workflow)');
      seedActiveWorkflow(root);
      const out2 = runHook(root);
      assert.doesNotMatch(out2, /pending memory candidate/, 'no nag when pending is empty (active workflow)');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
