// brainstorm-and-codesign — AC-007
//
// On /integrate failure classified as "needs spec change" with codesign_mode
// true, harness writes revisit_context to .claude/state/codesign/<slug>.json
// (creating the file if absent). Subsequent /spec invocation reads
// revisit_context and re-enters codesign mode on the named decision.
//
// SUT: .claude/skills/harness/codesign-reentry.mjs
//      .claude/skills/spec/codesign-state.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

let reentry;
let codesignState;
try {
  reentry = await import(path.join(REPO_ROOT, '.claude/skills/harness/codesign-reentry.mjs'));
  codesignState = await import(path.join(REPO_ROOT, '.claude/skills/spec/codesign-state.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/harness/codesign-reentry.mjs or spec/codesign-state.mjs not yet implemented. ` +
    `Original: ${err.message}`
  );
}

describe('codesign re-entry on integrate-failure (AC-007)', () => {
  it('test_when_integrate_fails_needs_spec_change_then_revisit_context_written', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cs-reentry-'));
    try {
      await fs.mkdir(path.join(tmp, '.claude/state/codesign'), { recursive: true });

      // Seed a codesign state with one pre-existing decision.
      const statePath = path.join(tmp, '.claude/state/codesign/foo.json');
      await fs.writeFile(statePath, JSON.stringify({
        slug: 'foo',
        created_at: 1700000000,
        decisions: [{ id: 'D1', name: 'CV approach', chosen: 'classical', revisit_count: 0 }],
      }, null, 2));

      reentry.writeRevisitContext({
        rootDir: tmp,
        slug: 'foo',
        failing_ac: 'AC-001',
        behavior: 'sequence diverged from contract',
        decision_id: 'D1',
      });

      const after = JSON.parse(await fs.readFile(statePath, 'utf8'));
      assert.ok(after.revisit_context, 'revisit_context field appended');
      assert.equal(after.revisit_context.failing_ac, 'AC-001');
      assert.equal(after.revisit_context.decision_id, 'D1');
      assert.ok(after.revisit_context.set_at, 'set_at timestamp recorded');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_spec_resumes_with_revisit_context_then_loads_target_decision', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cs-resume-'));
    try {
      await fs.mkdir(path.join(tmp, '.claude/state/codesign'), { recursive: true });
      const statePath = path.join(tmp, '.claude/state/codesign/foo.json');
      await fs.writeFile(statePath, JSON.stringify({
        slug: 'foo',
        created_at: 1700000000,
        decisions: [
          { id: 'D1', name: 'A', chosen: 'opt1', revisit_count: 0 },
          { id: 'D2', name: 'B', chosen: 'opt2', revisit_count: 0 },
        ],
        revisit_context: {
          failing_ac: 'AC-001',
          behavior: 'diverged',
          decision_id: 'D2',
          set_at: Date.now(),
        },
      }, null, 2));

      const resume = codesignState.loadForResume({ rootDir: tmp, slug: 'foo' });
      assert.equal(resume.revisit_target.id, 'D2',
        'spec resume targets the decision named in revisit_context');
      assert.equal(resume.revisit_target.name, 'B');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
