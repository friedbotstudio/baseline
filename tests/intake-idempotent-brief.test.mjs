// brainstorm-and-codesign — AC-001 concurrency
//
// Second /intake invocation on the same slug short-circuits if
// docs/brief/<slug>.md already exists; brainstorm returns final_state:
// 'complete' immediately without re-running the dialogue.
//
// SUT: .claude/skills/brainstorm/skip-check.mjs (existing-brief check)

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
try {
  skipCheck = await import(path.join(REPO_ROOT, '.claude/skills/brainstorm/skip-check.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/brainstorm/skip-check.mjs not yet implemented. Original: ${err.message}`
  );
}

describe('intake idempotent brief (AC-001 concurrency)', () => {
  it('test_when_intake_invoked_twice_then_second_invocation_short_circuits_on_existing_brief', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'intake-idem-'));
    try {
      const briefPath = path.join(tmp, 'docs/brief/foo.md');
      await fs.mkdir(path.dirname(briefPath), { recursive: true });
      await fs.writeFile(briefPath, '# Existing brief\n\n## Actor\nfoo\n');

      const verdict = skipCheck.shouldSkipForExistingBrief({
        slug: 'foo',
        rootDir: tmp,
      });
      assert.equal(verdict.skip, true, 'second invocation skips when brief exists');
      assert.equal(verdict.reason, 'existing_brief',
        'reason identifies the short-circuit cause');
      assert.equal(verdict.brief_path, briefPath, 'returns path to existing brief');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_no_existing_brief_then_does_not_short_circuit', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'intake-idem-no-'));
    try {
      const verdict = skipCheck.shouldSkipForExistingBrief({
        slug: 'foo',
        rootDir: tmp,
      });
      assert.equal(verdict.skip, false, 'no skip when no existing brief');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
