// brainstorm-and-codesign — AC-001 boundary
//
// Brainstorm call with empty/whitespace request returns final_state: 'needs_human'
// AND does NOT write docs/brief/<slug>.md.
//
// SUT: .claude/skills/brainstorm/validate-call.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

let validateCall;
try {
  validateCall = await import(path.join(REPO_ROOT, '.claude/skills/brainstorm/validate-call.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/brainstorm/validate-call.mjs not yet implemented (RED expected pre-/implement). ` +
    `Original import error: ${err.message}`
  );
}

describe('brainstorm empty-request boundary (AC-001 boundary)', () => {
  it('test_when_brainstorm_called_with_empty_request_then_final_state_needs_human', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bs-empty-'));
    try {
      const result = validateCall.validateCall({
        request: '',
        slug: 'foo',
        calling_phase: 'intake',
        outDir: tmp,
      });
      assert.equal(result.final_state, 'needs_human',
        'empty request → final_state must be needs_human');
      assert.equal(result.brief_path, null, 'no brief written for empty request');
      const briefDir = path.join(tmp, 'docs/brief');
      const exists = await fs.access(briefDir).then(() => true).catch(() => false);
      assert.equal(exists, false, 'docs/brief/ must not be created for empty request');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_brainstorm_called_with_whitespace_only_request_then_final_state_needs_human', () => {
    const result = validateCall.validateCall({
      request: '   \n\t  ',
      slug: 'foo',
      calling_phase: 'intake',
    });
    assert.equal(result.final_state, 'needs_human');
  });
});
