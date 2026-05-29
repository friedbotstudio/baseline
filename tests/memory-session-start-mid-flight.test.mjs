// Tests for #11 — snapshot freshness gate removal + mid-flight workflow
// surface. Pre-#11, snapshots older than 7 days were silently dropped.
// Post-#11, they surface with an age warning and (when a workflow.json
// indicates the workflow never reached commit) a mid-flight hint.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
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

const SNAPSHOT_BODY = `---
name: resume
type: continuity
---

# Resume snapshot

## Active workflow
- Slug: \`fixture-mid-flight\`
- Last completed phase: \`integrate\`

## Continue with
Run \`/harness\` to resume \`fixture-mid-flight\` at phase \`document\`.
`;

function seedTree() {
  const root = mkdtempSync(join(tmpdir(), 'mem-midflight-'));
  mkdirSync(join(root, '.claude/memory'), { recursive: true });
  mkdirSync(join(root, '.claude/state/harness'), { recursive: true });
  for (const name of ['landmarks', 'libraries', 'decisions', 'landmines',
    'conventions', 'pending-questions', 'backlog']) {
    writeFileSync(join(root, '.claude/memory', `${name}.md`), FRONTMATTER);
  }
  writeFileSync(join(root, '.claude/memory/_pending.md'),
    '---\nowners: [test]\n---\n\n# Pending\n');
  return root;
}

function seedSnapshot(root, ageDays = 0) {
  const path = join(root, '.claude/memory/_resume.md');
  writeFileSync(path, SNAPSHOT_BODY);
  if (ageDays > 0) {
    const t = (Date.now() - ageDays * 86400000) / 1000;
    utimesSync(path, t, t);
  }
}

function seedWorkflow(root, completed = []) {
  writeFileSync(join(root, '.claude/state/workflow.json'),
    JSON.stringify({ slug: 'fixture-mid-flight', track_id: 'freeform', completed }));
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

describe('memory_session_start — #11 snapshot freshness + mid-flight surface', () => {
  it('surfaces a 30-day-old snapshot (previously gated at 7 days)', () => {
    const root = seedTree();
    try {
      seedSnapshot(root, 30);
      const out = runHook(root);
      assert.match(out, /# Resume snapshot/, 'snapshot body should appear even when >7d old');
      assert.match(out, /snapshot age: 30d/, 'age should appear in framing');
      assert.match(out, /verify before relying/, 'age >7d should carry the verify-before-relying warning');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('omits the age warning for fresh (<=7d) snapshots', () => {
    const root = seedTree();
    try {
      seedSnapshot(root, 2);
      const out = runHook(root);
      assert.match(out, /snapshot age: 2d/, 'age should appear');
      assert.doesNotMatch(out, /verify before relying/, 'fresh snapshot should not carry the warning');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a mid-flight workflow (workflow.json present, commit not in completed[])', () => {
    const root = seedTree();
    try {
      seedSnapshot(root, 3);
      seedWorkflow(root, ['intake', 'scout', 'spec']);
      const out = runHook(root);
      assert.match(out, /Workflow `fixture-mid-flight` is mid-flight/, 'expected mid-flight callout');
      assert.match(out, /\/harness.*resume/, 'mid-flight hint should mention /harness');
      assert.match(out, /\/triage.*abandon/, 'mid-flight hint should mention /triage to abandon');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('suppresses mid-flight callout when workflow has completed commit', () => {
    const root = seedTree();
    try {
      seedSnapshot(root, 3);
      seedWorkflow(root, ['intake', 'scout', 'spec', 'commit']);
      const out = runHook(root);
      // The slug literal "fixture-mid-flight" appears in the snapshot body, so
      // match the actual callout sentence instead of the bare phrase.
      assert.doesNotMatch(out, /is mid-flight/, 'completed workflow should not produce the mid-flight callout');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
