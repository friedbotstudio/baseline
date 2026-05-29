// brainstorm-and-codesign — AC-010
//
// /triage parses --no-brainstorm and --codesign substrings from the request
// string; sets workflow.json fields skip_brainstorm and codesign_mode
// respectively. Flags are independent — both may be set.
//
// SUT: .claude/skills/triage/flag-parser.mjs
//
// RED until /implement creates the helper.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

let flagParser;
try {
  flagParser = await import(path.join(REPO_ROOT, '.claude/skills/triage/flag-parser.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/triage/flag-parser.mjs not yet implemented (RED expected pre-/implement). ` +
    `Original import error: ${err.message}`
  );
}

describe('/triage flag parsing (AC-010)', () => {
  it('test_when_triage_request_carries_both_flags_then_workflow_json_sets_both_fields', () => {
    const r1 = flagParser.parseFlags('--no-brainstorm --codesign add a new feature foo');
    assert.equal(r1.skip_brainstorm, true);
    assert.equal(r1.codesign_mode, true);
    assert.ok(!r1.cleaned_request.includes('--no-brainstorm'), 'flags stripped from cleaned_request');
    assert.ok(!r1.cleaned_request.includes('--codesign'));
    assert.ok(r1.cleaned_request.includes('add a new feature foo'), 'free-form portion preserved');
  });

  it('test_when_only_no_brainstorm_flag_present_then_codesign_mode_remains_false', () => {
    const r = flagParser.parseFlags('--no-brainstorm fix the worker bug');
    assert.equal(r.skip_brainstorm, true);
    assert.equal(r.codesign_mode, false, 'independence: codesign_mode untouched');
  });

  it('test_when_only_codesign_flag_present_then_skip_brainstorm_remains_false', () => {
    const r = flagParser.parseFlags('--codesign design a new transformer encoder');
    assert.equal(r.skip_brainstorm, false, 'independence: skip_brainstorm untouched');
    assert.equal(r.codesign_mode, true);
  });

  it('test_when_no_flags_present_then_both_fields_false_default', () => {
    const r = flagParser.parseFlags('plain old request');
    assert.equal(r.skip_brainstorm, false);
    assert.equal(r.codesign_mode, false);
  });
});
