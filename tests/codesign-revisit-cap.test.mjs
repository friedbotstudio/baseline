// brainstorm-and-codesign — AC-007 boundary
//
// When a codesign decision's revisit_count reaches 3 and another revisit is
// attempted (would be the 4th), /spec terminates with final_state:
// 'needs_human' and surfaces a one-line message. No further AskUserQuestion
// fires for that decision.
//
// SUT: .claude/skills/spec/codesign-state.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

let codesignState;
try {
  codesignState = await import(path.join(REPO_ROOT, '.claude/skills/spec/codesign-state.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/spec/codesign-state.mjs not yet implemented. Original: ${err.message}`
  );
}

describe('codesign revisit cap (AC-007 boundary)', () => {
  it('test_when_revisit_count_reaches_3_then_4th_attempt_terminates_with_needs_human', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cs-cap-'));
    try {
      await fs.mkdir(path.join(tmp, '.claude/state/codesign'), { recursive: true });
      const statePath = path.join(tmp, '.claude/state/codesign/foo.json');
      await fs.writeFile(statePath, JSON.stringify({
        slug: 'foo',
        created_at: 1700000000,
        decisions: [{ id: 'D1', name: 'CV approach', chosen: 'x', revisit_count: 3 }],
      }, null, 2));

      const result = codesignState.attemptRevisit({
        rootDir: tmp, slug: 'foo', decision_id: 'D1',
      });
      assert.equal(result.final_state, 'needs_human',
        '4th revisit (when revisit_count=3) terminates with needs_human');
      assert.ok(/cap|3|human/i.test(result.message), 'message names the cap reason');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_revisit_count_below_3_then_attempt_succeeds_and_increments', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cs-cap-ok-'));
    try {
      await fs.mkdir(path.join(tmp, '.claude/state/codesign'), { recursive: true });
      const statePath = path.join(tmp, '.claude/state/codesign/foo.json');
      await fs.writeFile(statePath, JSON.stringify({
        slug: 'foo',
        created_at: 1700000000,
        decisions: [{ id: 'D1', name: 'CV approach', chosen: 'x', revisit_count: 1 }],
      }, null, 2));

      const result = codesignState.attemptRevisit({
        rootDir: tmp, slug: 'foo', decision_id: 'D1',
      });
      assert.notEqual(result.final_state, 'needs_human');
      const after = JSON.parse(await fs.readFile(statePath, 'utf8'));
      const d = after.decisions.find((x) => x.id === 'D1');
      assert.equal(d.revisit_count, 2, 'revisit_count incremented from 1 to 2');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
