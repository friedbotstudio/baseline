// spec-lint's epic checks, pinned against the live specs on disk and against
// the one behavior change unifying the slice grammar caused.
//
// Both checks FAILED against all three specs in docs/specs/ at 02f3c68, every
// AC reported "assigned to no slice", because the local heading pattern refused
// the titled headings every epic spec on disk writes. They had never passed on
// a real epic.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkEpicSliceAssignment,
  checkEpicStateConsistency,
  sliceOwnershipInSpec,
} from '../.claude/skills/spec-lint/lint.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const EPIC_SPECS = ['erp-portables', 'mvp-sprint-parallel-cycles', 'codebugger-explanation-trace'];

function specFor(slug) {
  return readFileSync(join(REPO_ROOT, 'docs', 'specs', `${slug}.md`), 'utf8');
}

describe('slice ownership reads only the AC label line', () => {
  // The change scout warned about: spec-lint used to scrape every AC-NNN in the
  // slice body, so an AC a slice merely referred to counted as one it owned.
  // Deliberate and pinned here rather than absorbed silently.
  const SPEC = [
    '# Epic',
    '',
    '## Acceptance criteria',
    '',
    '| ID | Criterion |',
    '|---|---|',
    '| AC-001 | a |',
    '| AC-014 | b |',
    '',
    '## Slice A — the one under test',
    '',
    '**Acceptance criteria**: AC-001.',
    '',
    'Depends on AC-014 from an earlier slice, which is built first.',
    '',
  ].join('\n');

  // covers AC-003
  test('test_when_an_ac_is_referred_to_in_prose_then_the_slice_does_not_own_it', () => {
    assert.deepEqual(Object.fromEntries(sliceOwnershipInSpec(SPEC)), { A: ['AC-001'] });
  });

  // covers AC-014
  test('test_when_a_slice_heading_carries_a_title_then_its_acs_resolve', () => {
    assert.ok(sliceOwnershipInSpec(SPEC).has('A'), 'a titled heading must resolve');
  });

  // covers AC-006
  test('test_when_a_slice_id_prefixes_another_then_ownership_does_not_cross_match', () => {
    const spec = SPEC
      + '\n## Slice A1 — a later slice whose id starts with A\n\n**Acceptance criteria**: AC-014.\n';
    assert.deepEqual(Object.fromEntries(sliceOwnershipInSpec(spec)), { A: ['AC-001'], A1: ['AC-014'] });
  });
});

describe('the live epic specs', () => {
  for (const slug of EPIC_SPECS) {
    // covers AC-001
    test(`test_when_epic_slice_assignment_runs_on_${slug.replace(/-/g, '_')}_then_no_ac_fails_for_want_of_a_heading`, () => {
      const [status, detail] = checkEpicSliceAssignment(specFor(slug), {
        track_id: 'epic', slug, rootDir: REPO_ROOT,
      });
      if (status === 'PASS') return;
      // erp-portables reports AC-011 and AC-012, and that report is TRUE: both
      // are cross-cutting enforcement criteria no slice section claims. The
      // check is not taught to ignore them (spec D11).
      assert.equal(slug, 'erp-portables', `${slug}: ${detail}`);
      assert.match(detail, /assigned to no slice: AC-011, AC-012$/,
        'only the two genuinely unassigned ACs remain; 16 were reported at 02f3c68');
    });

    // covers AC-007
    test(`test_when_epic_state_consistency_runs_on_${slug.replace(/-/g, '_')}_then_it_passes_or_names_the_schema`, () => {
      const [status, detail] = checkEpicStateConsistency(specFor(slug), {
        track_id: 'epic', slug, rootDir: REPO_ROOT,
      });
      if (status === 'SKIP') return;
      if (status === 'PASS') return;
      // A prose-shaped `slices[].acs` is one named schema violation, not one
      // "assigned to no slice" row per sentence.
      assert.match(detail, /^epic-state-schema: slices\[\]\.acs must hold AC-NNN ids/,
        `${slug} must name the schema, not misreport prose as missing ACs`);
    });
  }

  // covers AC-002
  test('test_when_the_state_files_are_read_then_the_id_shaped_ones_are_consistent', () => {
    const idShaped = EPIC_SPECS.filter((slug) => {
      const path = join(REPO_ROOT, '.claude', 'state', 'epic', `${slug}.json`);
      if (!existsSync(path)) return false;
      const state = JSON.parse(readFileSync(path, 'utf8'));
      return (state.slices ?? []).every((s) => (s.acs ?? []).every((a) => /^AC-\d+$/.test(a)));
    });
    assert.ok(idShaped.length > 0, 'at least one live epic must exercise the consistency path');
    for (const slug of idShaped) {
      const [status, detail] = checkEpicStateConsistency(specFor(slug), {
        track_id: 'epic', slug, rootDir: REPO_ROOT,
      });
      assert.equal(status, 'PASS', `${slug}: ${detail}`);
    }
  });
});

describe('non-epic tracks are untouched', () => {
  // covers AC-014
  test('test_when_the_track_is_not_epic_then_both_checks_skip', () => {
    for (const check of [checkEpicSliceAssignment, checkEpicStateConsistency]) {
      assert.equal(check('# anything', { track_id: 'intake-full' })[0], 'SKIP');
    }
  });
});

describe('section extractors are line-anchored', () => {
  // covers AC-009
  // Landmine spec-lint-and-guard-section-regexes-are-not-line-anchored: an
  // unanchored opener matched a prose mention of the heading in an earlier
  // section, and the lazy body then ran past the real table. The recorded
  // mitigation was author-side advice; both code sites are anchored now.
  test('test_when_a_non_goals_bullet_quotes_the_heading_then_the_real_table_is_read', async () => {
    const { acIdsInSpec } = await import('../.claude/skills/spec-lint/lint.mjs');
    const { acceptanceCriteriaSection } = await import('../.claude/skills/spec-diagram-review/oracle.mjs');
    const spec = [
      '# Spec', '',
      '## Non-goals', '',
      '- Not touching the `' + '## Acceptance criteria' + '` table.', '',
      '## Acceptance criteria', '',
      '| ID | Criterion |', '|---|---|', '| AC-001 | a |', '| AC-002 | b |', '',
      '## Rollout', '',
    ].join('\n');
    assert.deepEqual(acIdsInSpec(spec), ['AC-001', 'AC-002'],
      'the prose mention must not hijack the section');
    assert.match(acceptanceCriteriaSection(spec), /AC-002/);
  });
});

describe('the epic state writer rejects prose', () => {
  // covers AC-019
  test('test_when_a_prose_shaped_acs_array_is_written_then_the_writer_throws', async () => {
    const { assertAcIdShape, isAcIdShape, offendingAcs } =
      await import('../.claude/skills/lib/epic-acs.mjs');
    assert.equal(isAcIdShape(['AC-001', 'AC-002']), true);
    assert.equal(isAcIdShape([]), true, 'an empty list claims nothing and is well-shaped');
    assert.equal(isAcIdShape(['A sprint manifest decomposes the MVP']), false);
    assert.deepEqual(offendingAcs(['AC-001', 'a sentence']), ['a sentence']);
    assert.throws(
      () => assertAcIdShape(['a criterion sentence'], 'slices["A"].acs'),
      /slices\["A"\]\.acs must hold AC-NNN ids/,
      'the error must name the field and the offending value',
    );
    assert.throws(() => assertAcIdShape('not-an-array', 'slices["A"].acs'), TypeError);
    assert.doesNotThrow(() => assertAcIdShape(['AC-001'], 'slices["A"].acs'));
  });

  // covers AC-019
  test('test_when_retriage_materializes_prose_acs_then_it_refuses_before_writing', async () => {
    const { materializeRetriagedEpic } = await import('../.claude/skills/triage/retriage.mjs');
    const { mkdtempSync, existsSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const root = mkdtempSync(join(tmpdir(), 'retriage-acs-'));
    assert.throws(
      () => materializeRetriagedEpic({
        rootDir: root,
        proposal: { epicSlug: 'x', title: 'x', slices: [{ id: 'A', title: 'one', acs: ['a sentence'] }] },
      }),
      /must hold AC-NNN ids/,
    );
    assert.equal(existsSync(join(root, '.claude/state/epic/x.json')), false,
      'nothing is written when the shape is refused');
  });
});
