// erp-portables slice DEF (D + E) — AC-004, AC-005
//
// Build-to-spec doctrine helpers in the triage field-handling module:
//
//   validateNoveltyRecord({novelty, novelty_evidence, track_id,
//     leanest_track_id, track_reason}) -> {valid, reason}
//     - novelty must be one of pattern-copy|spec-derived|novel|ambiguous
//     - novelty_evidence must be a non-empty cited string
//     - a heavier-than-leanest track pick requires a named track_reason
//
//   resolveSkipBrainstorm({novelty, complete_framing, no_brainstorm_flag}) -> boolean
//     - spec-derived / pattern-copy -> true (derives from spec/pattern; no dialogue)
//     - novel WITH complete_framing -> true; novel WITHOUT -> false
//     - ambiguous -> false (genuinely ambiguous AND answers change the build)
//     - no_brainstorm_flag forces true regardless of novelty
//
// SUT: .claude/skills/triage/flag-parser.mjs
//
// RED until /implement adds the two exports.

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
    `.claude/skills/triage/flag-parser.mjs failed to import. Original: ${err.message}`
  );
}

const NOVELTY_VALUES = ['pattern-copy', 'spec-derived', 'novel', 'ambiguous'];

function record(overrides = {}) {
  return {
    novelty: 'spec-derived',
    novelty_evidence: 'request names slice DEF of the approved erp-portables epic spec',
    track_id: 'epic-child',
    leanest_track_id: 'epic-child',
    track_reason: undefined,
    ...overrides,
  };
}

describe('validateNoveltyRecord (AC-004)', () => {
  it('test_when_novelty_value_outside_enum_then_invalid', () => {
    assert.equal(typeof flagParser.validateNoveltyRecord, 'function',
      'flag-parser.mjs exports validateNoveltyRecord');
    for (const bad of ['greenfield', '', null, undefined, 42]) {
      const r = flagParser.validateNoveltyRecord(record({ novelty: bad }));
      assert.equal(r.valid, false, `novelty=${JSON.stringify(bad)} must be invalid`);
      assert.ok(typeof r.reason === 'string' && r.reason.length > 0,
        'invalid verdict carries a named reason');
    }
  });

  it('test_when_novelty_valid_and_evidence_cited_then_valid', () => {
    for (const novelty of NOVELTY_VALUES) {
      const r = flagParser.validateNoveltyRecord(record({ novelty }));
      assert.equal(r.valid, true, `novelty=${novelty} with cited evidence on leanest track is valid`);
    }
  });

  it('test_when_evidence_missing_or_blank_then_invalid', () => {
    for (const bad of [undefined, null, '', '   ']) {
      const r = flagParser.validateNoveltyRecord(record({ novelty_evidence: bad }));
      assert.equal(r.valid, false, `evidence=${JSON.stringify(bad)} must be invalid`);
      assert.ok(r.reason.length > 0, 'invalid verdict carries a named reason');
    }
  });

  it('test_when_heavier_track_picked_without_track_reason_then_invalid', () => {
    for (const bad of [undefined, null, '', '   ']) {
      const r = flagParser.validateNoveltyRecord(record({
        track_id: 'intake-full',
        leanest_track_id: 'spec-entry',
        track_reason: bad,
      }));
      assert.equal(r.valid, false,
        `heavier pick with track_reason=${JSON.stringify(bad)} must be invalid`);
    }
  });

  it('test_when_heavier_track_picked_with_named_reason_then_valid', () => {
    const r = flagParser.validateNoveltyRecord(record({
      track_id: 'intake-full',
      leanest_track_id: 'spec-entry',
      track_reason: 'constitutional amendment surface needs full discovery',
    }));
    assert.equal(r.valid, true, 'heavier pick with a named reason is valid');
  });

  it('test_when_leanest_track_picked_then_track_reason_optional', () => {
    const r = flagParser.validateNoveltyRecord(record({ track_reason: undefined }));
    assert.equal(r.valid, true, 'track_reason is not required on the leanest pick');
  });
});

describe('resolveSkipBrainstorm (AC-005)', () => {
  it('test_when_novelty_maps_to_skip_brainstorm_then_explicit_flag_matches_doctrine', () => {
    assert.equal(typeof flagParser.resolveSkipBrainstorm, 'function',
      'flag-parser.mjs exports resolveSkipBrainstorm');

    const cases = [
      [{ novelty: 'spec-derived', complete_framing: false, no_brainstorm_flag: false }, true],
      [{ novelty: 'pattern-copy', complete_framing: false, no_brainstorm_flag: false }, true],
      [{ novelty: 'novel', complete_framing: true, no_brainstorm_flag: false }, true],
      [{ novelty: 'novel', complete_framing: false, no_brainstorm_flag: false }, false],
      [{ novelty: 'ambiguous', complete_framing: false, no_brainstorm_flag: false }, false],
      [{ novelty: 'ambiguous', complete_framing: true, no_brainstorm_flag: false }, false],
      [{ novelty: 'ambiguous', complete_framing: false, no_brainstorm_flag: true }, true],
      [{ novelty: 'novel', complete_framing: false, no_brainstorm_flag: true }, true],
    ];
    for (const [input, expected] of cases) {
      const got = flagParser.resolveSkipBrainstorm(input);
      assert.equal(typeof got, 'boolean', 'return value is always an explicit boolean');
      assert.equal(got, expected,
        `resolveSkipBrainstorm(${JSON.stringify(input)}) must be ${expected}`);
    }
  });
});
