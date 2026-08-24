// T6 — /spec-lint never checks the epic AC-to-slice rule.
//
// seed.md §18.9 and spec/SKILL.md both require that every AC in an epic spec be
// assigned to exactly one slice. lint.mjs carries seven checks and zero
// occurrences of the word "epic", so the rule lives in prose only.
//
// Observed: a first draft left AC-029 and AC-030 assigned to no slice and passed
// overall PASS, while the epic state file separately claimed slice B6 owned them.
// The two records disagreed and the spec — which is what an epic-child actually
// reads — silently dropped the exit criterion.
//
// RED until: lint.mjs gains `epic_slice_assignment` and `epic_state_consistency`,
// both conditional on the epic track and SKIP everywhere else.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LINT = join(REPO_ROOT, '.claude/skills/spec-lint/lint.mjs');

function specWith(acRows, sliceSections) {
  return [
    '# Spec — fixture',
    '',
    '## Acceptance criteria',
    '',
    '| ID | Criterion | Kind | Upstream AC | Sequence |',
    '|---|---|---|---|---|',
    ...acRows,
    '',
    ...sliceSections,
    '',
  ].join('\n');
}

const AC_ROWS = [
  '| AC-001 | given x when y then z | behavior | u | §Behavior #1 |',
  '| AC-029 | given x when y then z | behavior | u | §Behavior #2 |',
  '| AC-030 | given x when y then z | behavior | u | §Behavior #3 |',
];

const SLICE_A_OWNS_ONLY_001 = ['## Slice A', '', 'ACs: AC-001', ''];
const SLICES_COVER_ALL = ['## Slice A', '', 'ACs: AC-001', '', '## Slice B', '', 'ACs: AC-029, AC-030', ''];
const SLICES_DOUBLE_CLAIM = ['## Slice A', '', 'ACs: AC-001, AC-029', '', '## Slice B', '', 'ACs: AC-029, AC-030', ''];

function withTempRoot(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'epic-slice-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeEpicState(root, slug, slices) {
  const stateDir = join(root, '.claude/state/epic');
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, `${slug}.json`), JSON.stringify({ epic: slug, slices }, null, 2));
}

describe('AC-012 — an AC assigned to zero or many slices fails the lint', () => {
  it('test_when_an_ac_is_assigned_to_zero_or_many_slices_then_spec_lint_fails', async () => {
    const { checkEpicSliceAssignment } = await import(LINT);

    const orphaned = checkEpicSliceAssignment(
      specWith(AC_ROWS, SLICE_A_OWNS_ONLY_001),
      { track_id: 'epic' }
    );
    assert.equal(orphaned[0], 'FAIL', 'an AC owned by no slice must fail');
    assert.match(String(orphaned[1]), /AC-029/, 'the failure must name the orphaned AC');
    assert.match(String(orphaned[1]), /AC-030/, 'every orphaned AC is named, not just the first');

    const doubled = checkEpicSliceAssignment(
      specWith(AC_ROWS, SLICES_DOUBLE_CLAIM),
      { track_id: 'epic' }
    );
    assert.equal(doubled[0], 'FAIL', 'an AC owned by two slices must fail');
    assert.match(String(doubled[1]), /AC-029/, 'the failure must name the double-claimed AC');
  });

  it('test_when_every_ac_is_owned_by_exactly_one_slice_then_the_check_passes', async () => {
    const { checkEpicSliceAssignment } = await import(LINT);

    const clean = checkEpicSliceAssignment(specWith(AC_ROWS, SLICES_COVER_ALL), { track_id: 'epic' });
    assert.equal(clean[0], 'PASS', 'full one-to-one coverage passes');
  });

  it('test_when_the_track_is_not_epic_then_the_check_skips', async () => {
    const { checkEpicSliceAssignment } = await import(LINT);

    for (const track of ['spec-entry', 'chore', 'tdd-quickfix', 'power', undefined]) {
      const r = checkEpicSliceAssignment(specWith(AC_ROWS, []), { track_id: track });
      assert.equal(r[0], 'SKIP', `the check is epic-only; ${track} must SKIP, never FAIL`);
    }
  });
});

describe('AC-013 — the spec and the epic state file must agree', () => {
  it('test_when_the_spec_and_epic_state_disagree_then_spec_lint_fails_naming_both', async () => {
    const { checkEpicStateConsistency } = await import(LINT);

    withTempRoot((root) => {
      // The observed failure: state claims B6 owns AC-029/030, the spec does not.
      writeEpicState(root, 'fixture', [
        { id: 'A', acs: ['AC-001'] },
        { id: 'B6', acs: ['AC-029', 'AC-030'] },
      ]);

      const r = checkEpicStateConsistency(specWith(AC_ROWS, SLICE_A_OWNS_ONLY_001), {
        track_id: 'epic',
        slug: 'fixture',
        rootDir: root,
      });
      assert.equal(r[0], 'FAIL', 'a disagreement between spec and state must fail');
      assert.match(String(r[1]), /AC-029/, 'the failure names the disputed AC');
      assert.match(String(r[1]), /B6/, 'and names the slice the state claims owns it');
    });
  });

  it('test_when_the_spec_and_epic_state_agree_then_the_check_passes', async () => {
    const { checkEpicStateConsistency } = await import(LINT);

    withTempRoot((root) => {
      writeEpicState(root, 'fixture', [
        { id: 'A', acs: ['AC-001'] },
        { id: 'B', acs: ['AC-029', 'AC-030'] },
      ]);

      const r = checkEpicStateConsistency(specWith(AC_ROWS, SLICES_COVER_ALL), {
        track_id: 'epic',
        slug: 'fixture',
        rootDir: root,
      });
      assert.equal(r[0], 'PASS', 'agreement passes');
    });
  });

  it('test_when_the_epic_state_file_is_absent_then_the_check_skips_rather_than_failing', async () => {
    const { checkEpicStateConsistency } = await import(LINT);

    withTempRoot((root) => {
      const r = checkEpicStateConsistency(specWith(AC_ROWS, SLICES_COVER_ALL), {
        track_id: 'epic',
        slug: 'no-such-epic',
        rootDir: root,
      });
      assert.equal(r[0], 'SKIP', 'a missing state file is not evidence of a defect');
    });
  });
});
