// Tests for slice scoping in `pinned-spec.mjs` + `drift_check.mjs`.
//
// An `epic-child` pins its slice as `docs/specs/<epic>.md#slice-B1`. The slice id
// resolved correctly and then nothing downstream could use it: `sliceSection`
// anchored the heading with `\s*$`, so a spec writing `## Slice B1 — ports and the
// server composition root` matched nothing, and `sliceAcIds` demanded a leading `-`
// bullet that no epic spec on disk has ever written.
//
// Neither failure was reported. `parseAcs` widened an empty scope to the spec's
// FULL AC list, so one slice's drift tick scored all 37 criteria of its epic and
// called 31 of them unresolved — every one owned by a slice nobody had built yet.
// A vacuous red at whole-epic scale, indistinguishable from real drift.
//
// The heading and bullet forms are widened here, but the load-bearing fix is the
// third one: an empty scope must be REPORTED, never silently substituted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sliceSection, sliceAcIds } from '../.claude/hooks/lib/pinned-spec.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DRIFT = join(REPO_ROOT, '.claude/skills/tdd/drift_check.mjs');

const TITLED_HEADING = '## Slice B1 — ports and the `server` composition root';

function git(root, ...args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

function initRepo() {
  const root = mkdtempSync(join(tmpdir(), 'driftscope-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@test');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'commit', '--allow-empty', '-q', '-m', 'seed', '--no-gpg-sign');
  return root;
}

function writeFile(root, relPath, content) {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
}

// The spec's top-level AC table is the only place `drift_check` reads ids from; a
// slice section names which of them it owns.
function specText(acIds, sliceBlocks) {
  const rows = acIds.map((id) => `| ${id} | criterion ${id} | test |`).join('\n');
  return [
    '# Spec',
    '',
    '## Acceptance criteria',
    '',
    '| id | description | verified-by |',
    '|---|---|---|',
    rows,
    '',
    ...sliceBlocks,
    '',
  ].join('\n');
}

function pinSliceSpec(root, { epic, childSlug, acIds, sliceBlocks }) {
  writeFile(root, `docs/specs/${epic}.md`, specText(acIds, sliceBlocks));
  writeFile(
    root,
    '.claude/state/workflow.json',
    JSON.stringify({ slug: childSlug, pinned_artifacts: { spec: `docs/specs/${epic}.md#slice-B1` } }, null, 2),
  );
}

function runDrift(root, slug) {
  const res = spawnSync('node', [DRIFT, '--slug', slug, '--project-root', root], { encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

function reportOf(root, slug) {
  return readFileSync(join(root, '.claude', 'state', 'drift', `${slug}.md`), 'utf8');
}

function acVerdictsIn(report) {
  return [...report.matchAll(/^\|\s*ac\s*\|\s*(AC-\d+)\s*\|\s*(\w+)\s*\|/gm)].map((m) => [m[1], m[2]]);
}

function scopingRowIn(report) {
  const m = report.match(/^\|\s*scoping\s*\|\s*(\S+)\s*\|\s*(\w+)\s*\|\s*([a-z-]+):/m);
  return m ? { id: m[1], verdict: m[2], state: m[3] } : null;
}

describe('sliceSection heading forms', () => {
  it('test_when_slice_heading_carries_a_title_then_the_section_resolves', () => {
    const spec = [TITLED_HEADING, '', 'body of B1', '', '## Slice B2 — something else', '', 'body of B2', ''].join('\n');

    const section = sliceSection(spec, 'B1');

    assert.notEqual(section, null, 'a titled slice heading must resolve to its section');
    assert.match(section, /body of B1/);
    assert.doesNotMatch(section, /body of B2/, 'the section must still stop at the next `##`');
  });

  it('test_when_slice_heading_is_bare_then_the_section_still_resolves', () => {
    const spec = ['## Slice B1', '', 'body of B1', '', '## Slice B2', '', 'body of B2', ''].join('\n');

    const section = sliceSection(spec, 'B1');

    assert.notEqual(section, null, 'the pre-existing bare form must keep working');
    assert.match(section, /body of B1/);
    assert.doesNotMatch(section, /body of B2/);
  });

  it('test_when_a_slice_id_prefixes_another_then_it_does_not_cross_match', () => {
    const spec = ['## Slice B10 — the tenth slice', '', 'body of B10', ''].join('\n');

    assert.equal(sliceSection(spec, 'B1'), null, 'B1 must not match the heading for B10');
  });
});

describe('sliceAcIds label forms', () => {
  it('test_when_the_ac_label_has_no_bullet_then_the_ids_parse', () => {
    assert.deepEqual(sliceAcIds('**ACs**: AC-001, AC-002\n'), ['AC-001', 'AC-002']);
  });

  it('test_when_the_ac_label_is_acceptance_criteria_then_the_ids_parse', () => {
    assert.deepEqual(sliceAcIds('**Acceptance criteria**: AC-002, AC-005.\n'), ['AC-002', 'AC-005']);
  });

  it('test_when_the_ac_label_is_the_legacy_bullet_then_the_ids_still_parse', () => {
    assert.deepEqual(sliceAcIds('- **ACs**: AC-004, AC-005\n'), ['AC-004', 'AC-005'], 'the widening is additive');
  });
});

describe('drift_check scoping failure is reported, never widened', () => {
  const EPIC = 'drift-scope-epic';
  const CHILD = 'drift-scope-child';
  const SIX_ACS = ['AC-001', 'AC-002', 'AC-003', 'AC-004', 'AC-005', 'AC-006'];

  function repoWithMissingSection() {
    const root = initRepo();
    pinSliceSpec(root, { epic: EPIC, childSlug: CHILD, acIds: SIX_ACS, sliceBlocks: ['## Slice C — an unrelated slice', '', '**ACs**: AC-006', ''] });
    writeFile(root, 'impl.mjs', 'export const done = true;\n');
    return root;
  }

  it('test_when_the_pinned_slice_section_is_missing_then_the_scan_does_not_widen', () => {
    const root = repoWithMissingSection();

    runDrift(root, CHILD);

    assert.deepEqual(acVerdictsIn(reportOf(root, CHILD)), [], 'a failed scope must score no AC, not all of them');
  });

  it('test_when_the_pinned_slice_section_is_missing_then_the_report_leads_with_the_failure', () => {
    const root = repoWithMissingSection();

    const res = runDrift(root, CHILD);
    const report = reportOf(root, CHILD);

    assert.match(report, /\*\*SCOPING FAILED\*\* — slice `B1` pinned, but no `## Slice B1` heading resolves in the spec\. The spec's full AC list was NOT substituted\./);
    assert.deepEqual(scopingRowIn(report), { id: 'B1', verdict: 'unresolved', state: 'section-missing' });
    assert.equal(res.status, 1, 'a scoping failure must fail the gate even with no AC scored');
  });

  it('test_when_a_slice_section_has_no_ac_list_then_it_is_distinguishable_from_a_missing_section', () => {
    const root = initRepo();
    pinSliceSpec(root, { epic: EPIC, childSlug: CHILD, acIds: SIX_ACS, sliceBlocks: [TITLED_HEADING, '', 'This slice describes its behavior in prose and names no ids.', ''] });
    writeFile(root, 'impl.mjs', 'export const done = true;\n');

    const res = runDrift(root, CHILD);
    const report = reportOf(root, CHILD);

    assert.deepEqual(scopingRowIn(report), { id: 'B1', verdict: 'unresolved', state: 'acs-missing' });
    assert.match(report, /the `## Slice B1` section carries no AC list/);
    assert.deepEqual(acVerdictsIn(report), [], 'an AC-less slice scores no AC either');
    assert.equal(res.status, 1);
  });

  // Found by the phase-8 review of this very change. Fixing the scoping put this
  // branch on the live path for the first time: before, no titled heading resolved,
  // so the filter never ran and the code always widened instead.
  it('test_when_a_slice_label_names_only_unknown_ac_ids_then_the_gate_does_not_go_green', () => {
    const root = initRepo();
    pinSliceSpec(root, { epic: EPIC, childSlug: CHILD, acIds: ['AC-001', 'AC-002'], sliceBlocks: [TITLED_HEADING, '', '**ACs**: AC-999.', ''] });
    writeFile(root, 'impl.mjs', 'export const done = true;\n');

    const res = runDrift(root, CHILD);
    const report = reportOf(root, CHILD);

    assert.deepEqual(scopingRowIn(report), { id: 'B1', verdict: 'unresolved', state: 'acs-unknown' });
    assert.match(report, /the AC list names AC-999, and the spec's AC table has none of them/);
    assert.deepEqual(acVerdictsIn(report), [], 'nothing was scanned, so nothing may be scored');
    assert.equal(res.status, 1, 'a scan that covered no AC must never exit 0');
  });

  it('test_when_a_slice_label_names_one_unknown_ac_id_then_the_known_ones_still_score', () => {
    const root = initRepo();
    pinSliceSpec(root, { epic: EPIC, childSlug: CHILD, acIds: ['AC-001', 'AC-002'], sliceBlocks: [TITLED_HEADING, '', '**ACs**: AC-002, AC-999.', ''] });
    writeFile(root, 'impl.mjs', '// covers AC-002\nexport const done = true;\n');

    const res = runDrift(root, CHILD);
    const report = reportOf(root, CHILD);

    assert.deepEqual(scopingRowIn(report), { id: 'B1', verdict: 'unresolved', state: 'acs-partial' });
    assert.match(report, /the AC list names AC-999, which the spec's AC table does not carry/);
    assert.deepEqual(acVerdictsIn(report), [['AC-002', 'resolved']], 'the id that does resolve is still scored');
    assert.equal(res.status, 1, 'an id the label claims and the table lacks must not pass silently');
  });

  it('test_when_no_slice_is_pinned_then_the_full_ac_list_is_scanned', () => {
    const root = initRepo();
    const slug = 'drift-scope-plain';
    writeFile(root, `docs/specs/${slug}.md`, specText(['AC-001', 'AC-002', 'AC-003'], []));
    writeFile(root, 'impl.mjs', '// covers AC-001, AC-002, AC-003\nexport const done = true;\n');

    const res = runDrift(root, slug);
    const report = reportOf(root, slug);

    assert.deepEqual(acVerdictsIn(report), [['AC-001', 'resolved'], ['AC-002', 'resolved'], ['AC-003', 'resolved']]);
    assert.equal(scopingRowIn(report), null, 'an unscoped scan reports no scoping row');
    assert.doesNotMatch(report, /SCOPING FAILED/);
    assert.equal(res.status, 0);
  });

  it('test_when_a_titled_slice_with_a_dashless_ac_label_is_pinned_then_only_its_acs_are_scored', () => {
    const root = initRepo();
    pinSliceSpec(root, {
      epic: EPIC,
      childSlug: CHILD,
      acIds: ['AC-001', 'AC-002', 'AC-003', 'AC-005'],
      sliceBlocks: [
        '## Slice B2 — the sibling that owns AC-001',
        '',
        '**ACs**: AC-001.',
        '',
        TITLED_HEADING,
        '',
        '**ACs**: AC-002, AC-005.',
        '',
        '## Slice B10 — the sibling whose id starts with B1',
        '',
        '**ACs**: AC-003.',
        '',
      ],
    });
    writeFile(root, 'impl.mjs', '// covers AC-002 and AC-005\nexport const done = true;\n');

    const res = runDrift(root, CHILD);
    const report = reportOf(root, CHILD);

    assert.deepEqual(acVerdictsIn(report), [['AC-002', 'resolved'], ['AC-005', 'resolved']], "only the pinned slice's ACs are scored");
    assert.equal(scopingRowIn(report), null, 'a successful scope reports no scoping row');
    assert.equal(res.status, 0, "a slice whose own ACs are covered must not fail on its siblings' ACs");
  });
});
