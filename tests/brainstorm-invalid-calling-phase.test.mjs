// brainstorm-and-codesign — AC-001 contract
//
// Brainstorm called with calling_phase outside {intake, spec, tdd} returns
// final_state: 'needs_human' and writes no brief. This catches misroutes
// where /chore or /freeform accidentally invokes brainstorm.
//
// SUT: .claude/skills/brainstorm/validate-call.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    `.claude/skills/brainstorm/validate-call.mjs not yet implemented. Original: ${err.message}`
  );
}

describe('brainstorm invalid calling-phase contract (AC-001 contract)', () => {
  for (const bad of ['chore', 'freeform', 'simplify', 'integrate', 'archive', '', null, undefined]) {
    const label = bad === null ? 'null' : bad === undefined ? 'undefined' : JSON.stringify(bad);
    it(`test_when_brainstorm_called_with_calling_phase_${String(label).replace(/[^\w]/g, '_')}_then_final_state_needs_human`, () => {
      const result = validateCall.validateCall({
        request: 'a non-empty real request that would otherwise be processed',
        slug: 'foo',
        calling_phase: bad,
      });
      assert.equal(result.final_state, 'needs_human',
        `calling_phase=${label} must yield needs_human`);
      assert.equal(result.brief_path, null);
    });
  }

  for (const good of ['intake', 'spec', 'tdd']) {
    it(`test_when_brainstorm_called_with_valid_calling_phase_${good}_then_validate_passes`, () => {
      const result = validateCall.validateCall({
        request: 'a non-empty real request',
        slug: 'foo',
        calling_phase: good,
      });
      assert.notEqual(result.final_state, 'needs_human',
        `calling_phase=${good} must pass validation gate`);
    });
  }
});
