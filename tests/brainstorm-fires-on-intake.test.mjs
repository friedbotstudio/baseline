// brainstorm-and-codesign — AC-001, AC-004
//
// PM-mode brainstorm gate: entry skills (/intake, /spec, /tdd) invoke the
// brainstorm helper at Step 0.5 when workflow.json → skip_brainstorm is false
// or absent; on completion the brainstorm skill writes docs/brief/<slug>.md
// with required structured fields.
//
// SUT: .claude/skills/brainstorm/skip-check.mjs (decides whether to fire)
//      .claude/skills/brainstorm/brief-writer.mjs (writes the brief)
//
// RED until /implement creates the helpers.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

let skipCheck;
let briefWriter;
try {
  skipCheck = await import(path.join(REPO_ROOT, '.claude/skills/brainstorm/skip-check.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/brainstorm/skip-check.mjs not yet implemented (RED is expected pre-/implement). ` +
    `Original import error: ${err.message}`
  );
}
try {
  briefWriter = await import(path.join(REPO_ROOT, '.claude/skills/brainstorm/brief-writer.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/brainstorm/brief-writer.mjs not yet implemented (RED is expected pre-/implement). ` +
    `Original import error: ${err.message}`
  );
}

describe('brainstorm gate + brief writer (AC-001, AC-004)', () => {
  it('test_when_intake_invoked_with_skip_brainstorm_false_then_brainstorm_fires_and_brief_written', async () => {
    assert.equal(
      skipCheck.shouldSkip({ skip_brainstorm: false }),
      false,
      'shouldSkip returns false when skip_brainstorm explicitly false'
    );
    assert.equal(
      skipCheck.shouldSkip({}),
      false,
      'shouldSkip returns false when skip_brainstorm absent (default-on-missing per AC-008)'
    );

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'brainstorm-brief-'));
    try {
      const briefPath = path.join(tmp, 'docs/brief/foo.md');
      await briefWriter.writeBrief({
        outPath: briefPath,
        slug: 'foo',
        fields: {
          actor: 'oncall engineer',
          trigger: 'pager fires at 03:00',
          current_state: 'pager fires on transient 5xx',
          desired_state: 'transient 5xx self-heals via retry',
          non_goals: ['change payload shape'],
          solution_leakage: [],
        },
      });
      const text = await fs.readFile(briefPath, 'utf8');
      for (const field of ['actor', 'trigger', 'current_state', 'desired_state', 'non_goals', 'solution_leakage']) {
        assert.ok(text.includes(field) || new RegExp(field.replace(/_/g, '[ -]'), 'i').test(text),
          `brief output must reference field "${field}"`);
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
