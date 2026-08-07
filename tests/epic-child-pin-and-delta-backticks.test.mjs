// Two recorded defects, both surfaced while landing system-spec-delta slice C.
//
// (1) Epic-child pin resolution. `drift_check.mjs` and `workspace/delta.mjs` both
// resolve a spec at `docs/specs/<slug>.md` and nowhere else. An epic-child has no
// spec at its own slug — its contract is the pin `docs/specs/<epic>.md#slice-<id>`
// — so both exit vacuously green on every epic-child: drift_check with
// `no spec; skipped`, verifyAndApplyDelta with an all-empty verdict that reads
// exactly like a landing which declared nothing. Three consecutive children shipped
// on that green (erp-portables-slice-a, system-spec-delta slices A and B).
//
// (2) Delta anchor backticks. The shipped spec template writes delta anchors in
// backticks; `parseDelta` keeps the cell verbatim, so `anchorMatches` fails and
// spec-lint reports `falls outside the governed surface` — an error naming the
// wrong cause.
//
// The load-bearing test here is the SCOPING one. `AC_ROW_RE` matches the spec's
// top-level AC TABLE, and a `## Slice <id>` section carries no such rows — it lists
// `- **ACs**: AC-004, ...` as a bullet. So the obvious reading of "scope the AC scan
// to the slice section" matches zero rows and reports clean, which is the same
// vacuous green with a longer stack trace. The ids come from the bullet; the
// top-level table is then filtered by them.
//
// `track_guard.mjs:59-66` already resolves pins correctly and is NOT touched: it is
// the source this fix copies. A third independent implementation is the thing the
// landmine explicitly warns against.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tryImport } from './helpers/memory-fixtures.mjs';
import { makeWorkspace, writeWorkspaceConcept, writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PINNED = '.claude/hooks/lib/pinned-spec.mjs';
const DELTA = '.claude/skills/workspace/delta.mjs';
const DRIFT = join(REPO_ROOT, '.claude/skills/tdd/drift_check.mjs');
const LINT = join(REPO_ROOT, '.claude/skills/spec-lint/lint.mjs');

const EPIC = 'an-epic';
const CHILD = 'an-epic-slice-c';

// ─── Foundation: temp projects ───

function makeRoot(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeAt(root, rel, text) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, 'utf8');
  return rel;
}

function writeWorkflow(root, workflow) {
  return writeAt(root, '.claude/state/workflow.json', JSON.stringify(workflow, null, 2));
}

function pinnedWorkflow(spec) {
  return { slug: CHILD, track_id: 'epic-child', epic: EPIC, pinned_artifacts: { spec } };
}

// A sliced epic spec in the shape /spec actually emits: ONE top-level AC table, and
// per-slice sections whose ACs are a bullet. The asymmetry is the point.
function slicedSpec() {
  return [
    `# Spec — ${EPIC}`,
    '',
    '## Acceptance criteria',
    '',
    '| ID | Criterion | Kind |',
    '|---|---|---|',
    '| AC-001 | belongs to slice B | behavior |',
    '| AC-004 | belongs to slice C | behavior |',
    '| AC-005 | also slice C | behavior |',
    '| AC-009 | belongs to slice D | behavior |',
    '',
    '## Slice B',
    '',
    'MARKER-SLICE-B',
    '',
    '- **ACs**: AC-001',
    '',
    '## Slice C',
    '',
    'MARKER-SLICE-C',
    '',
    '- **ACs**: AC-004, AC-005',
    '',
    '## Slice D',
    '',
    'MARKER-SLICE-D',
    '',
    '- **ACs**: AC-009',
    '',
  ].join('\n');
}

async function loadPinned() {
  const mod = await tryImport(PINNED);
  assert.ok(mod?.resolveSpecPath, `${PINNED} does not export resolveSpecPath yet`);
  assert.ok(mod?.sliceSection, `${PINNED} does not export sliceSection yet`);
  assert.ok(mod?.sliceAcIds, `${PINNED} does not export sliceAcIds yet`);
  return mod;
}

// ─── The shared resolver ───

describe('pinned-spec — one resolver, copied from the guard that already works', () => {
  it('test_when_a_spec_exists_at_the_slug_then_it_resolves_by_slug', async () => {
    const { resolveSpecPath } = await loadPinned();
    const root = makeRoot('pin-slug-');
    writeAt(root, 'docs/specs/quickfix-thing.md', '# Spec\n');

    // No workflow.json on disk at all. A resolver that reached for it before trying
    // the slug would throw or misreport here, which is what pins the ordering.
    const result = resolveSpecPath({ rootDir: root, slug: 'quickfix-thing' });

    assert.equal(result.source, 'slug', 'a spec at the slug is the single-shot path and must not change');
    assert.equal(result.sliceId, null, 'a slug-resolved spec is not scoped to any slice');
    assert.equal(result.path, join(root, 'docs/specs/quickfix-thing.md'));
  });

  it('test_when_no_spec_at_the_slug_but_a_pin_resolves_then_it_resolves_by_pin', async () => {
    const { resolveSpecPath } = await loadPinned();
    const root = makeRoot('pin-pin-');
    writeAt(root, `docs/specs/${EPIC}.md`, slicedSpec());
    writeWorkflow(root, pinnedWorkflow(`docs/specs/${EPIC}.md#slice-C`));

    const result = resolveSpecPath({ rootDir: root, slug: CHILD });

    assert.equal(result.source, 'pin', 'the child has no spec of its own; the pin IS its contract');
    assert.equal(result.sliceId, 'C', 'the #slice-<id> fragment names the section to scope to');
    assert.equal(result.path, join(root, `docs/specs/${EPIC}.md`), 'the fragment is stripped before the path check');
  });

  it('test_when_neither_the_slug_nor_a_pin_resolves_then_it_reports_no_spec_anywhere', async () => {
    const { resolveSpecPath } = await loadPinned();

    // Three ways to have no spec. All must report the SAME thing, and it must be
    // distinguishable from "spec exists but not at this slug" — collapsing those two
    // into one branch is precisely what produced the defect.
    const cases = [
      ['no workflow.json at all', (root) => root],
      ['workflow.json with no pinned_artifacts', (root) => (writeWorkflow(root, { slug: 'x', track_id: 'chore' }), root)],
      ['a pin naming a file that is not on disk', (root) => (writeWorkflow(root, pinnedWorkflow('docs/specs/ghost.md#slice-A')), root)],
    ];

    for (const [label, seed] of cases) {
      const root = seed(makeRoot('pin-none-'));
      const result = resolveSpecPath({ rootDir: root, slug: CHILD });
      assert.equal(result.source, null, `${label}: there is genuinely no spec anywhere`);
      assert.equal(result.path, null, `${label}: no path may be reported`);
      assert.equal(result.sliceId, null, `${label}`);
    }
  });

  it('test_when_the_pin_carries_a_traversal_then_it_is_rejected_before_any_read', async () => {
    const { resolveSpecPath } = await loadPinned();
    const root = makeRoot('pin-trav-');

    // docs/ does not exist in this fixture, so an ENOENT would prove a read ran
    // before the guard. REJECT, never repair: normalizing the path would resolve a
    // different file than the pin named.
    for (const pin of ['../../etc/passwd', '/etc/passwd', 'docs/../../escaped.md', 'docs/specs/x.md#slice-C/../../y']) {
      writeWorkflow(root, pinnedWorkflow(pin));
      assert.throws(
        () => resolveSpecPath({ rootDir: root, slug: CHILD }),
        /unsafe path traversal/,
        `pin ${JSON.stringify(pin)} must be rejected, not resolved`,
      );
    }
  });

  // Phase-8 finding, docs/security/epic-child-pin-and-delta-backticks-2026-08-07.md.
  // The pin half was guarded from the start; the slug half was not, and this is a
  // Foundation primitive every future caller inherits. Confirmed by execution:
  // slug '../../secrets/private' resolved to and read a file outside docs/specs/.
  it('test_when_the_slug_carries_a_traversal_then_it_is_rejected_before_any_read', async () => {
    const { resolveSpecPath } = await loadPinned();
    const root = makeRoot('pin-slugtrav-');
    writeAt(root, 'secrets/private.md', 'SECRET\n');

    for (const slug of ['../../secrets/private', '../escape', 'a/b', '..', '/etc/passwd']) {
      assert.throws(
        () => resolveSpecPath({ rootDir: root, slug }),
        /unsafe slug|over-long slug/,
        `slug ${JSON.stringify(slug)} must be REJECTED — normalizing it would read a different file`,
      );
    }

    // The guard belongs in the thing that builds the path, not in each caller.
    // verifyAndApplyDelta happens to call assertSafeSlug first and readSourceText
    // after; drift_check does neither, and a third caller would inherit whichever
    // discipline its author remembered.
    assert.equal(
      resolveSpecPath({ rootDir: root, slug: 'legitimate-slug' }).source,
      null,
      'a well-formed slug with no spec still resolves to nothing, not to a throw',
    );
  });

  it('test_when_a_slice_id_is_given_then_only_that_slices_section_is_returned', async () => {
    const { sliceSection } = await loadPinned();
    const text = slicedSpec();

    const sliceC = sliceSection(text, 'C');
    assert.match(sliceC, /MARKER-SLICE-C/, 'the named slice body must be returned');
    assert.ok(!sliceC.includes('MARKER-SLICE-B'), 'the preceding slice must not leak in');
    assert.ok(!sliceC.includes('MARKER-SLICE-D'), 'the section must stop at the next ## heading');
    assert.equal(sliceSection(text, 'Z'), null, 'a slice the spec does not carry resolves to nothing');
  });

  it('test_when_a_slice_section_lists_acs_as_a_bullet_then_its_ids_are_extracted', async () => {
    const { sliceAcIds, sliceSection } = await loadPinned();
    const section = sliceSection(slicedSpec(), 'C');

    // The whole reason this function exists. A slice section carries NO `| AC-004 |`
    // table rows, so scoping drift_check's AC_ROW_RE to `section` would match zero
    // and report clean — the same vacuous green, one layer deeper. The bullet is the
    // id source; the spec's top-level table is then filtered by it.
    assert.ok(!/^\|\s*AC-\d+\s*\|/m.test(section), 'sanity: a slice section has no AC table rows to match');

    assert.deepEqual(sliceAcIds(section), ['AC-004', 'AC-005'], "the '- **ACs**:' bullet is the id source");
    assert.deepEqual(sliceAcIds(sliceSection(slicedSpec(), 'B')), ['AC-001'], 'and it is per-slice');
    assert.deepEqual(sliceAcIds('no bullet here'), [], 'a section with no ACs bullet yields nothing, never a throw');
  });
});

// ─── First component: drift_check ───

function git(root, ...args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

function initRepo(prefix) {
  const root = makeRoot(prefix);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@test');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'commit', '--allow-empty', '-q', '-m', 'seed', '--no-gpg-sign');
  return root;
}

function runDrift(root, slug) {
  const res = spawnSync('node', [DRIFT, '--slug', slug, '--project-root', root], { encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function reportOf(root, slug) {
  try {
    return readFileSync(join(root, '.claude', 'state', 'drift', `${slug}.md`), 'utf8');
  } catch {
    return null;
  }
}

describe('drift_check — an epic-child scans the slice its pin names', () => {
  it('test_when_an_epic_child_runs_drift_check_then_it_scans_the_pinned_slices_acs', () => {
    const root = initRepo('drift-pin-');
    writeAt(root, `docs/specs/${EPIC}.md`, slicedSpec());
    writeWorkflow(root, pinnedWorkflow(`docs/specs/${EPIC}.md#slice-C`));
    writeAt(root, 'impl.mjs', 'placeholder\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'seed spec', '--no-gpg-sign');

    // The diff resolves both of slice C's ACs and neither of its siblings'.
    writeAt(root, 'impl.mjs', '// covers AC-004 and AC-005\nexport const done = true;\n');

    // ONE run, then assert. The report is an untracked file whose rows name every
    // scanned id verbatim, so a second run scores ids against the checker's own
    // output — the self-contamination tests/drift-check-ac-range.test.mjs records.
    const res = runDrift(root, CHILD);

    assert.ok(
      !res.stdout.includes('no spec; skipped'),
      'the pin resolves, so this is not the no-spec branch — that vacuous green is the defect',
    );
    const report = reportOf(root, CHILD);
    assert.ok(report, 'a real scan writes a report');
    assert.match(report, /AC-004/, "the pinned slice's ACs must be scanned");
    assert.match(report, /AC-005/);
    assert.ok(!report.includes('AC-001'), "a sibling slice's AC must not be scored against this slice's diff");
    assert.ok(!report.includes('AC-009'), 'nor a later slice\'s');
    assert.equal(res.status, 0, 'both scoped ACs are named in the diff, so the scan is clean');
  });

  it('test_when_no_spec_exists_anywhere_then_drift_check_still_skips_with_exit_zero', () => {
    const root = initRepo('drift-chore-');
    writeWorkflow(root, { slug: 'a-chore', track_id: 'chore' });
    writeAt(root, 'notes.md', 'chore edit\n');

    const res = runDrift(root, 'a-chore');

    // The branch that must NOT change. A careless fix folds it into the new pin
    // branch and every chore starts failing on a spec it was never going to have.
    assert.match(res.stdout, /no spec; skipped/, 'a chore has no spec anywhere and genuinely skips');
    assert.equal(res.status, 0);
    assert.equal(reportOf(root, 'a-chore'), null, 'a skipped scan writes no report');
  });
});

// ─── Second component: archive Step 5 ───

const GOVERNED_SURFACE = {
  roots: ['src/'],
  codeExtensions: ['.mjs'],
  alwaysIncluded: [],
  excludedSegments: ['tests/'],
  excludedTrees: [],
};

function flaggedProject(root) {
  writeAt(root, '.claude/project.json', JSON.stringify({
    memory: {
      architecture_map: {
        enabled: true,
        governed_surface: GOVERNED_SURFACE,
        witnesses: { c4_component: { witness: 'anchor-digest' } },
      },
    },
  }));
}

describe('archive Step 5 — an epic-child reads the delta its pin names', () => {
  it('test_when_an_epic_child_runs_archive_step_5_then_it_reads_the_pinned_specs_delta', async () => {
    const delta = await tryImport(DELTA);
    assert.ok(delta?.verifyAndApplyDelta, `${DELTA} does not export verifyAndApplyDelta`);

    const root = makeRoot('delta-pin-');
    const specDir = join(root, 'docs', 'system');
    flaggedProject(root);
    writeAt(root, 'src/alpha.mjs', 'export const a = 1;\n');
    writeAt(root, 'src/foo_guard.mjs', 'export const f = 1;\n');
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'alpha', { anchor: 'src/alpha.mjs' });
    writeWorkspaceConcept(specDir, 'guard-substrate', {
      title: 'Guard substrate', members: ['alpha'], anchors: 'alpha=src/alpha.mjs',
    });

    writeAt(root, `docs/specs/${EPIC}.md`, [
      `# Spec — ${EPIC}`,
      '',
      '## System delta',
      '',
      '| Verb | Element | Anchor | Concept | Kind |',
      '|---|---|---|---|---|',
      '| add | foo-guard | src/foo_guard.mjs | guard-substrate | c4_component |',
      '',
      '## Slice C',
      '',
      '- **ACs**: AC-004',
      '',
    ].join('\n'));
    writeWorkflow(root, pinnedWorkflow(`docs/specs/${EPIC}.md#slice-C`));

    const result = delta.verifyAndApplyDelta({
      slug: CHILD, specDir, memDir: join(root, '.claude/memory'), rootDir: root,
      touchedPaths: ['src/foo_guard.mjs'],
    });

    // Before the fix this returned all-empty — indistinguishable from a landing that
    // declared nothing, which is exactly how a real declared delta goes unapplied.
    assert.deepEqual(result.applied, ['foo-guard'], 'the pinned spec declared it and the diff confirms it');
    assert.deepEqual(result.drift, [], 'a confirmed row is not drift');
    assert.equal(result.shardsWritten.length, 1, 'the confirmed row writes its shard');
  });
});

// ─── Second defect: backticked anchors ───

describe('parseDelta — the template\'s backticked anchor form parses', () => {
  it('test_when_a_delta_anchor_is_backticked_then_it_parses_to_the_bare_path', async () => {
    const delta = await tryImport(DELTA);
    const text = [
      '## System delta',
      '',
      '| Verb | Element | Anchor | Concept | Kind |',
      '|---|---|---|---|---|',
      '| add | foo-guard | `.claude/hooks/foo_guard.mjs` | guard-substrate | c4_component |',
      '',
    ].join('\n');

    const { rows, errors } = delta.parseDelta(text);

    assert.deepEqual(errors, [], 'the template\'s own row shape must not be an error');
    assert.equal(rows.length, 1);
    assert.equal(
      rows[0].anchor,
      '.claude/hooks/foo_guard.mjs',
      'surrounding backticks are markdown decoration, not part of the path',
    );
  });

  it('test_when_an_anchor_has_no_backticks_or_an_inner_backtick_then_it_is_unchanged', async () => {
    const delta = await tryImport(DELTA);
    const text = [
      '## System delta',
      '',
      '| Verb | Element | Anchor | Concept | Kind |',
      '|---|---|---|---|---|',
      '| add | bare-el | .claude/hooks/bare.mjs | c | c4_component |',
      '| add | inner-el | .claude/hooks/we`ird.mjs | c | c4_component |',
      '',
    ].join('\n');

    const { rows } = delta.parseDelta(text);

    assert.equal(rows[0].anchor, '.claude/hooks/bare.mjs', 'a bare anchor parses exactly as before');
    assert.equal(
      rows[1].anchor,
      '.claude/hooks/we`ird.mjs',
      'stripping is anchored to the ends — an interior backtick is content, never decoration',
    );
  });

  it('test_when_a_backticked_anchor_reaches_spec_lint_then_the_row_resolves', () => {
    const root = makeRoot('lint-tick-');
    const live = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/project.json'), 'utf8'));
    live.memory = { ...(live.memory || {}) };
    live.memory.architecture_map = { ...(live.memory.architecture_map || {}), enabled: true, governed_surface: GOVERNED_SURFACE };
    writeAt(root, '.claude/project.json', `${JSON.stringify(live, null, 2)}\n`);
    writeAt(root, 'src/foo_guard.mjs', 'export const f = 1;\n');

    writeAt(root, 'docs/specs/backticked.md', [
      '# backticked',
      '',
      '## Context',
      '',
      '**Write set**: `src/**`',
      '',
      '## Goal',
      '',
      'Pin the backtick rule.',
      '',
      '## Design',
      '',
      '## Design calls',
      '',
      '*(none)*',
      '',
      '## System delta',
      '',
      '| Verb | Element | Anchor | Concept | Kind |',
      '|---|---|---|---|---|',
      '| add | foo-guard | `src/foo_guard.mjs` | guard-substrate | c4_component |',
      '',
      '## Acceptance criteria',
      '',
      '## Test plan',
      '',
    ].join('\n'));

    const res = spawnSync('node', [LINT, 'backticked'], {
      encoding: 'utf8', cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    const row = (res.stdout ?? '').split('\n').find((l) => l.startsWith('system_delta')) ?? '';

    // Measured before the fix: FAIL with `falls outside the governed surface`, an
    // error naming the governed surface when the actual cause is two backticks.
    assert.match(row, /PASS/, `the template's own anchor form must lint clean; got: ${row.trim()}`);
  });
});
