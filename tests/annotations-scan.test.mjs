// Slice F delivery — the annotation SCAN and its consumer (AC-001, AC-002, AC-003,
// AC-009, AC-010).
//
// The ef cycle shipped resolveAnnotation with no caller: its unit tests were green
// while scout/SKILL.md never mentioned annotations, so AC-008/AC-009 passed against
// the module and nothing else. That is the fifth instance of the shape recorded in
// landmine `a-cycle-that-adds-a-gate-must-assert-the-consumer-calls-it`, and it is
// why the wiring and live-tree scenarios below are not optional extras — they are
// the only two that can fail when the feature is built but inert.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { join, makeProject, tryImport, writeShard, REPO_ROOT } from './helpers/memory-fixtures.mjs';

const SCAN = '.claude/skills/workspace/annotations.mjs';

const TEST_GLOBS = ['tests/**', '**/*.test.*'];

// A fixture project whose config the scanner actually reads. Passing the file list
// explicitly is not a shortcut around the scope rules — the exclusions are policy
// on the PATH, so they must fire regardless of how the list was obtained.
function projectWithSources(files) {
  const { root, memDir } = makeProject();
  writeFileSync(
    join(root, '.claude', 'project.json'),
    JSON.stringify({ tdd: { test_globs: TEST_GLOBS } }),
    'utf8',
  );
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return { root, memDir, files: Object.keys(files) };
}

function seedDecision(memDir, key, hook) {
  return writeShard(memDir, 'decisions', key, {
    key,
    fields: { governs: '.claude/skills/**' },
    bodyLines: [`- ${hook}`],
  });
}

describe('F — annotation scan (AC-001, AC-002)', () => {
  it('test_when_source_carries_resolvable_decision_annotation_then_scan_surfaces_hook', async () => {
    const scan = await tryImport(SCAN);
    assert.ok(scan, `${SCAN} does not exist yet`);
    const { root, memDir, files } = projectWithSources({
      'src/store.mjs': ['// @decision:corpus-is-authored', 'export const x = 1;'].join('\n'),
    });
    seedDecision(memDir, 'corpus-is-authored', 'The corpus is authored, not inferred from code.');

    const report = scan.scanAnnotations({ rootDir: root, memDir, files });

    assert.equal(report.resolved.length, 1, 'the one live annotation must be resolved');
    const [hit] = report.resolved;
    assert.equal(hit.file, 'src/store.mjs', 'the report must name the file');
    assert.equal(hit.line, 1, 'the report must name the line the annotation sits on');
    assert.equal(hit.verb, 'decision');
    assert.equal(hit.key, 'corpus-is-authored');
    assert.match(hit.hook, /authored, not inferred/, 'the hook line is the point — a boolean reaches no reader');
  });

  it('test_when_annotation_names_no_entry_then_reported_dangling_with_location', async () => {
    const scan = await tryImport(SCAN);
    assert.ok(scan, `${SCAN} does not exist yet`);
    const { root, memDir, files } = projectWithSources({
      'src/a.mjs': '// @decision:still-here',
      'src/b.mjs': ['', '// @decision:was-renamed'].join('\n'),
    });
    seedDecision(memDir, 'still-here', 'This one exists.');

    const report = scan.scanAnnotations({ rootDir: root, memDir, files });

    assert.equal(report.resolved.length, 1, 'the live annotation still resolves');
    assert.equal(report.dangling.length, 1, 'the stale annotation must be REPORTED, never dropped');
    const [stale] = report.dangling;
    assert.equal(stale.file, 'src/b.mjs');
    assert.equal(stale.line, 2, 'a dangling report is useless without the line');
    assert.equal(stale.key, 'was-renamed', 'the report must name the key that went stale');
  });

  it('test_when_verb_unrecognised_then_ignored_and_not_counted_dangling', async () => {
    const scan = await tryImport(SCAN);
    assert.ok(scan, `${SCAN} does not exist yet`);
    const { root, memDir, files } = projectWithSources({
      'src/c.mjs': ['// @research:docs/research/x.md', '// @bogus:whatever'].join('\n'),
    });

    const report = scan.scanAnnotations({ rootDir: root, memDir, files });

    assert.equal(report.resolved.length, 0);
    assert.equal(
      report.dangling.length,
      0,
      'an unrecognised verb is NOT a broken annotation — counting @research: dangling would report every one of them forever',
    );
  });
});

describe('F — scan scope (AC-009)', () => {
  it('test_when_path_under_docs_or_test_globs_or_key_is_placeholder_then_excluded', async () => {
    const scan = await tryImport(SCAN);
    assert.ok(scan, `${SCAN} does not exist yet`);
    const { root, memDir, files } = projectWithSources({
      'docs/annotations.md': '| `@decision:<key>` | example | `@decision:live-one` |',
      'tests/sample.test.mjs': "const ref = '@decision:was-deleted';",
      'src/real.mjs': '// @decision:live-one',
      'src/placeholder.mjs': '// @decision:<key>',
    });
    seedDecision(memDir, 'live-one', 'The only genuine annotation in this fixture.');

    const report = scan.scanAnnotations({ rootDir: root, memDir, files });

    assert.equal(report.resolved.length, 1, 'only src/real.mjs carries a genuine annotation');
    assert.equal(report.resolved[0].file, 'src/real.mjs');
    assert.equal(
      report.dangling.length,
      0,
      'each exclusion is proven by a real false positive: the docs syntax table, a test fixture string, and a <key> placeholder',
    );
  });

  it('test_when_root_is_not_a_git_worktree_then_scan_returns_empty_and_does_not_throw', async () => {
    const scan = await tryImport(SCAN);
    assert.ok(scan, `${SCAN} does not exist yet`);
    const { root, memDir } = projectWithSources({ 'src/d.mjs': '// @decision:anything' });

    let report;
    assert.doesNotThrow(() => {
      report = scan.scanAnnotations({ rootDir: root, memDir });
    }, 'a non-git project must degrade, never throw — every other memory consumer fails open');
    assert.equal(report.scanned, 0);
    assert.deepEqual(report.resolved, []);
    assert.deepEqual(report.dangling, []);
  });

  it('test_when_unreadable_file_in_list_then_scan_completes_without_it', async () => {
    const scan = await tryImport(SCAN);
    assert.ok(scan, `${SCAN} does not exist yet`);
    const { root, memDir } = projectWithSources({ 'src/e.mjs': '// @decision:live-one' });
    seedDecision(memDir, 'live-one', 'Still resolvable.');

    const report = scan.scanAnnotations({
      rootDir: root,
      memDir,
      files: ['src/e.mjs', 'src/deleted-since-listing.mjs'],
    });

    assert.equal(report.resolved.length, 1, 'the readable file still contributes');
    assert.equal(report.dangling.length, 0, 'an unreadable file is not a dangling annotation');
  });
});

// @kind:wiring — the scenarios above exercise the SCANNER. A scanner nothing calls
// reports nothing, which is exactly the state refs.mjs shipped in. AC-001 and AC-003
// are claims about scout's behaviour, so scout is what has to be asserted.
describe('F — the scanner is actually consulted (AC-001, AC-003)', () => {
  it('test_when_scout_skill_read_then_it_reaches_for_the_scanner', () => {
    const skill = readFileSync(join(REPO_ROOT, '.claude/skills/scout/SKILL.md'), 'utf8');
    assert.match(
      skill,
      /workspace\/annotations\.mjs/,
      'scout must invoke the scanner — an uninvoked scanner is the orphan this cycle exists to close',
    );
    assert.match(
      skill,
      /scanAnnotations/,
      'the step must name the function, not merely mention the module',
    );
  });

  it('test_when_scout_skill_read_then_flag_check_precedes_scan_call', () => {
    const skill = readFileSync(join(REPO_ROOT, '.claude/skills/scout/SKILL.md'), 'utf8');
    const gateAt = skill.search(/annotationsEnabled|memory\.annotations\.enabled/);
    const callAt = skill.indexOf('scanAnnotations');
    assert.ok(gateAt >= 0, 'scout must consult the annotations flag');
    assert.ok(callAt >= 0, 'sanity: scout must invoke the scanner');
    assert.ok(
      gateAt < callAt,
      'the flag must be checked BEFORE the scan, not merely mentioned somewhere in the file — a gate that runs after the thing it gates is not a gate',
    );
  });
});

// @kind:rollout — AC-010 is the end-state assertion on the LIVE tree. Asserting
// against a temp dir proves the function works and says nothing about whether this
// repository was ever annotated; that gap is precisely how slice E stayed dormant
// for a second consecutive cycle.
describe('F — live-tree end state (AC-010)', () => {
  it('test_when_live_tree_scanned_after_rollout_then_resolved_nonempty_and_dangling_empty', async () => {
    const scan = await tryImport(SCAN);
    assert.ok(scan, `${SCAN} does not exist yet`);

    const report = scan.scanAnnotations({
      rootDir: REPO_ROOT,
      memDir: join(REPO_ROOT, '.claude/memory'),
    });

    assert.ok(
      report.resolved.length > 0,
      'the live repository must actually carry annotations — a green unit suite over an unannotated tree is the built-but-inert failure',
    );
    assert.deepEqual(
      report.dangling.map((d) => `${d.file}:${d.line} ${d.key}`),
      [],
      'no annotation in the live tree may dangle',
    );
  });
});
