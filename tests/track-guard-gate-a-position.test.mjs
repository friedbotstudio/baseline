// Regression test for the gate-A-position defects reported against 0.26.1:
//
//   Defect 1 — workflow.artifacts mapped the human consent token to the
//   pre-gate-collapse `review` phase (the old post-spec gate slot), which no
//   track declares any more. track_guard demanded scout/research/spec before
//   letting /approve-direction write its token on `intake-full`/`spec-entry`,
//   where gate A now fires right after `intake` (seed.md §18).
//
//   Defect 2 — TRACK_ID_TO_ENTRY_PHASE mapped `spec-entry` to `spec` instead
//   of `intake`, making every ordering check before the spec write vacuous
//   (a scout write with no intake on disk was silently allowed).
//
// Drives track_guard.mjs via spawnSync against a temp CLAUDE_PROJECT_DIR, never
// this repo's live state.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GUARD = join(REPO_ROOT, '.claude/hooks/track_guard.mjs');
const LIB_DIR = join(REPO_ROOT, '.claude/hooks/lib');

const SANDBOXES = [];

// The fixed post-gate-collapse workflow map — `review` dropped from both `phases`
// and `artifacts` (the gate-A token's position is direction_approval_guard's
// business, not track_guard's).
const PROJECT_JSON = {
  configured: true,
  workflow: {
    phases: ['intake', 'scout', 'research', 'spec', 'tdd', 'simplify', 'security', 'integrate', 'document', 'commit'],
    artifacts: {
      intake: 'docs/intake/*.md',
      scout: 'docs/scout/*.md',
      research: 'docs/research/*.md',
      spec: 'docs/specs/*.md',
      tdd: null,
      simplify: null,
      security: 'docs/security/*.md',
      integrate: null,
      document: 'site/dist/**',
      commit: null,
    },
  },
};

function buildSandbox({ workflow, intakeFile = false }) {
  const root = mkdtempSync(join(tmpdir(), 'trackg-gateA-'));
  mkdirSync(join(root, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/state'), { recursive: true });
  mkdirSync(join(root, 'docs/intake'), { recursive: true });
  cpSync(GUARD, join(root, '.claude/hooks/track_guard.mjs'));
  cpSync(LIB_DIR, join(root, '.claude/hooks/lib'), { recursive: true });
  writeFileSync(join(root, '.claude/project.json'), JSON.stringify(PROJECT_JSON, null, 2));
  writeFileSync(join(root, '.claude/state/workflow.json'), JSON.stringify(workflow, null, 2));
  if (intakeFile) writeFileSync(join(root, 'docs/intake/demo.md'), '# intake\n');
  SANDBOXES.push(root);
  return root;
}

function runGuard(root, relFile) {
  const payload = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: join(root, relFile) } });
  const res = spawnSync('node', [join(root, '.claude/hooks/track_guard.mjs')], {
    input: payload,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  return { denied: res.stdout.includes('"permissionDecision":"deny"'), stdout: res.stdout };
}

after(() => { for (const s of SANDBOXES) rmSync(s, { recursive: true, force: true }); });

describe('track_guard gate-A position (consumer-defect regression)', () => {
  it('allows the approval token write on intake-full with only intake completed', () => {
    const root = buildSandbox({
      workflow: { track_id: 'intake-full', slug: 'demo', exceptions: [], completed: ['intake'] },
      intakeFile: true,
    });
    const result = runGuard(root, '.claude/state/spec_approvals/demo.approval');
    assert.equal(result.denied, false, result.stdout);
  });

  it('allows the approval token write on spec-entry with only intake completed', () => {
    const root = buildSandbox({
      workflow: { track_id: 'spec-entry', slug: 'demo', exceptions: ['research'], completed: ['intake'] },
      intakeFile: true,
    });
    const result = runGuard(root, '.claude/state/spec_approvals/demo.approval');
    assert.equal(result.denied, false, result.stdout);
  });

  it('still blocks a spec write on intake-full when nothing has run', () => {
    const root = buildSandbox({
      workflow: { track_id: 'intake-full', slug: 'demo', exceptions: [], completed: [] },
    });
    const result = runGuard(root, 'docs/specs/demo.md');
    assert.equal(result.denied, true);
    assert.match(result.stdout, /scout/);
    assert.match(result.stdout, /research/);
  });

  it('blocks a spec-entry scout write when no intake artifact exists (entry-phase fix tightens this)', () => {
    const root = buildSandbox({
      workflow: { track_id: 'spec-entry', slug: 'demo', exceptions: ['research'], completed: [] },
      intakeFile: false,
    });
    const result = runGuard(root, 'docs/scout/demo.md');
    assert.equal(result.denied, true, result.stdout);
    assert.match(result.stdout, /intake/);
  });

  it('allows a spec-entry scout write once the intake artifact exists', () => {
    const root = buildSandbox({
      workflow: { track_id: 'spec-entry', slug: 'demo', exceptions: ['research'], completed: ['intake'] },
      intakeFile: true,
    });
    const result = runGuard(root, 'docs/scout/demo.md');
    assert.equal(result.denied, false, result.stdout);
  });
});
