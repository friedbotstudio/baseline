// `--touched` parses both forms the SOP and the signature disagree about — AC-008.
//
// `archive/SKILL.md` Step 3 gives the signature `--touched <comma,separated,paths>`
// and then instructs the opposite in bold. Measured 2026-08-13 on one spec and
// tree: the JSON-array form gave confirmed 0 / drift 6, the comma-separated form
// gave confirmed 6 / drift 0 — and `inputEmpty` came back false BOTH times, so
// the field meant to separate malformed input from an honest no-match was
// defeated. A wrong answer that reports itself as a real answer is the failure.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_SOP = path.join(REPO_ROOT, '.claude/skills/archive/SKILL.md');

// The parser is not exported. Reaching it through the module that owns it keeps
// the test on the behavior rather than on the current address — the split lives
// in queries.mjs today and the spec's Layout named cli.mjs.
async function parseTouched(raw) {
  const mod = await import(
    `${path.join(REPO_ROOT, '.claude/skills/workspace/queries.mjs')}?t=${Date.now()}-${Math.random()}`
  );
  if (typeof mod.parseTouchedPaths !== 'function') {
    throw new Error(
      'queries.mjs must export parseTouchedPaths so both accepted forms have one ' +
      'testable owner; today the split is inlined in the private touchedPaths()',
    );
  }
  return mod.parseTouchedPaths(raw);
}

describe('workspace delta --touched — both forms parse, neither lies (AC-008)', () => {
  it('test_when_touched_is_comma_separated_then_delta_parses_it', async () => {
    assert.deepEqual(await parseTouched('a.mjs,b.mjs'), ['a.mjs', 'b.mjs'],
      'the comma-separated form works today and must not regress');
  });

  it('test_when_touched_is_json_array_then_delta_parses_it', async () => {
    assert.deepEqual(await parseTouched('["a.mjs","b.mjs"]'), ['a.mjs', 'b.mjs'],
      'the JSON-array form is what archive/SKILL.md Step 3 instructs in bold; today ' +
      'it splits on the commas INSIDE the array and yields quoted garbage paths');
  });

  it('test_when_touched_is_json_array_with_spaces_then_delta_parses_it', async () => {
    assert.deepEqual(await parseTouched('[ "a.mjs", "b.mjs" ]'), ['a.mjs', 'b.mjs'],
      'a shell-quoted array commonly carries padding; trimming is the parser\'s job');
  });

  it('test_when_touched_parses_to_nothing_then_input_empty_is_true', async () => {
    assert.deepEqual(await parseTouched(''), [],
      'an empty value must yield zero paths so the caller can report inputEmpty true — ' +
      'today BOTH forms report inputEmpty false, which is why malformed input read ' +
      'as an honest no-match');
  });

  it('test_when_touched_is_empty_json_array_then_it_yields_no_paths', async () => {
    assert.deepEqual(await parseTouched('[]'), [],
      'an explicitly empty array is an explicit no-paths, not a parse failure');
  });

  it('test_when_touched_json_array_contains_traversal_then_it_is_refused', async () => {
    await assert.rejects(
      async () => parseTouched('["../../etc/passwd"]'),
      'the traversal guard must apply to the new form too, or the JSON path becomes ' +
      'the way around a check the comma path already enforces',
    );
  });

  it('test_when_archive_sop_read_then_signature_and_instruction_agree', async () => {
    const { readFileSync } = await import('node:fs');
    const sop = readFileSync(ARCHIVE_SOP, 'utf8');

    const saysCommaOnly = /--touched\s+<comma,separated,paths>/.test(sop);
    const forbidsComma = /never as bare space-separated words/.test(sop)
      && /one quoted JSON array/.test(sop);

    assert.ok(!(saysCommaOnly && forbidsComma),
      'archive/SKILL.md Step 3 states a --touched format its own signature contradicts. ' +
      'A reader following the bold instruction produced confirmed 0 / drift 6.');
  });
});
