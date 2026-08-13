// The comment-ratio measure inside the code-structure oracle.
//
// The threshold is 0.50 on the BODY ratio. Header lines are excluded because the
// module header is a sanctioned carve-out; counting it would make the check fire
// hardest on the smallest, most disciplined files (measured in docs/research).

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { tryImport } from './helpers/memory-fixtures.mjs';

const ORACLE = '.claude/skills/code-structure/oracle.mjs';
const THRESHOLD = 0.5;

let oracle;
before(async () => {
  oracle = await tryImport(ORACLE);
  assert.ok(oracle, `${ORACLE} must exist and export bodyCommentCount alongside its existing checks`);
});

function file(path, lines) {
  return { path, content: lines.join('\n') };
}

function run(changedFiles, deps) {
  return oracle.runCodeStructureOracle({ changedFiles }, deps).findings;
}

function commentFindings(findings) {
  return findings.filter((f) => f.check !== 'file_length');
}

// Two cases below assert an ABSENCE of findings, which an unimplemented oracle
// satisfies for free. Without this guard they would go green before the check exists.
function assertRatioCheckExists() {
  assert.equal(typeof oracle.bodyCommentCount, 'function', 'the ratio check must exist before an empty result means anything');
}

function body(commentCount, codeCount) {
  const lines = ['const start = 1;'];
  for (let i = 0; i < commentCount; i += 1) lines.push(`// reason ${i}`);
  for (let i = 0; i < codeCount - 1; i += 1) lines.push(`const v${i} = ${i};`);
  return lines;
}

describe('code-structure comment ratio', () => {
  it('test_when_body_ratio_over_threshold_then_oracle_reports_ratio_and_threshold', () => {
    // Covers AC-013, AC-021.
    const found = commentFindings(run([file('a.mjs', body(8, 10))]));
    assert.equal(found.length, 1);
    const text = `${found[0].evidence ?? ''} ${found[0].message ?? ''}`;
    assert.match(text, /0\.8|80/, 'the finding must name the measured ratio');
    assert.match(text, /0\.5|50/, 'the finding must name the threshold it was measured against');
  });

  it('test_when_body_ratio_at_threshold_then_oracle_emits_no_comment_finding', () => {
    // Covers AC-014.
    assertRatioCheckExists();
    assert.deepEqual(
      commentFindings(run([file('b.mjs', body(5, 10))])), [],
      'exactly at the threshold is inside the bar — AC-014 makes the comparison strictly greater-than',
    );
  });

  it('test_when_file_is_all_module_header_then_body_count_is_zero', () => {
    // Covers AC-013, AC-017.
    const header = ['// Foundation — a module whose header is most of it.', '// Second header line.', '// Third.', ''];
    assert.equal(oracle.bodyCommentCount([...header, 'export const x = 1;'].join('\n')), 0);
    assert.deepEqual(commentFindings(run([file('c.mjs', [...header, 'export const x = 1;'])])), []);
  });

  it('test_when_file_has_no_substantive_lines_then_no_divide_by_zero', () => {
    // Covers AC-013.
    assertRatioCheckExists();
    const found = run([file('d.mjs', ['// only', '// comments', '// here'])]);
    assert.deepEqual(commentFindings(found), []);
    for (const f of found) {
      assert.ok(!/NaN|Infinity/.test(`${f.evidence ?? ''}${f.message ?? ''}`));
    }
  });

  it('test_when_dial_returns_mandatory_true_then_comment_finding_stays_advisory', () => {
    // Covers AC-015.
    for (const mandatory of [true, false]) {
      const found = commentFindings(run([file('e.mjs', body(8, 10))], { tierDial: () => ({ mandatory }) }));
      assert.equal(found.length, 1);
      assert.equal(
        found[0].severity, 'ADVISORY',
        'D-2 lands this advisory for one release; a dial change must not silently promote it to BLOCKER',
      );
    }
  });

  it('test_when_oracle_checks_enumerated_then_no_what_comment_classifier', () => {
    // Covers AC-016.
    const source = oracle.runCodeStructureOracle.toString() + Object.keys(oracle).join(' ');
    assert.ok(
      !/whatComment|isWhatComment|classifyComment|restates/i.test(source),
      'intake D-5 upholds the 2026-08-09 D-6 rejection — no oracle classifies an individual comment',
    );
  });

  it('test_when_file_over_line_budget_then_file_length_finding_unchanged', () => {
    // Covers AC-017.
    const lines = Array.from({ length: 81 }, (_, i) => `const v${i} = ${i};`);
    const found = run([file('f.mjs', lines)]).filter((f) => f.check === 'file_length');
    assert.equal(found.length, 1);
    assert.match(`${found[0].evidence}`, /81/);
    assert.match(`${found[0].evidence}`, /80/);
  });

  it('test_when_substantive_line_count_called_then_output_matches_prior_behavior', () => {
    // Covers AC-017.
    const mixed = ['// a', '# b', '* c', '/* d', '', 'const x = 1;', 'const y = 2;'].join('\n');
    assert.equal(oracle.substantiveLineCount(mixed), 2);
    assert.notEqual(
      oracle.substantiveLineCount, oracle.bodyCommentCount,
      'S-4: substantiveLineCount strips the numerator, so the ratio check needs its own counter',
    );
  });
});
