// The code-structure oracle judges source code. This pins what it does NOT judge.
//
// The checker enforces the Orchestration / Domain / Foundation layer model — an
// 80-line budget and a comment-density bar, both aimed at code that has layers.
// It was running against every file in the diff, so a test file, a markdown report
// and a Nunjucks template were all measured against a budget none of them can mean
// anything against.
//
// That is not a cosmetic complaint. A test file is long because it holds test
// cases, and under TDD every change ships with a test — so the oracle blocked the
// landing on essentially every change that added one. A gate that fires on all
// traffic is a wall, and the same reasoning is already written down for the
// right-size gate, which excludes `tdd.test_globs` for exactly this reason.
//
// Splitting a 236-line test file into three to satisfy a line count makes the
// suite worse, and no rearrangement of a markdown report gives it layers. The
// budget is kept, unchanged, for the files it was derived from.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runCodeStructureOracle, isJudgedByCodeStructure } from '../.claude/skills/code-structure/oracle.mjs';

const longBody = (lines) => Array.from({ length: lines }, (_, i) => `const v${i} = ${i};`).join('\n');
const file = (path, lines = 200, prior = null) => ({ path, content: longBody(lines), prior });
const lengthFindings = (files) =>
  runCodeStructureOracle({ changedFiles: files }).findings.filter((f) => f.check === 'file_length');

describe('what the oracle judges', () => {
  it('test_when_a_source_file_is_over_budget_then_it_is_still_reported', () => {
    // The budget is unchanged for the files it was derived from.
    const found = lengthFindings([file('src/cli/thing.mjs')]);
    assert.equal(found.length, 1, 'source code is still measured');
    assert.equal(found[0].severity, 'BLOCKER', 'and a newly-introduced over-budget file still blocks');
  });

  it('test_when_a_source_file_was_already_over_budget_then_it_reports_without_blocking', () => {
    // The inherited-debt carve-out is untouched by this change.
    const found = lengthFindings([file('src/cli/thing.mjs', 200, longBody(150))]);
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'ADVISORY');
  });

  it('test_when_the_file_is_a_test_then_it_is_not_measured', () => {
    // The case that made the gate a wall.
    for (const path of [
      'tests/baseline-native-messaging.test.mjs',
      'test/legacy.test.js',
      'spec/thing.spec.mjs',
      '__tests__/component.test.mjs',
      'src/deep/module_test.mjs',
    ]) {
      assert.deepEqual(lengthFindings([file(path)]), [], `${path} must not be measured`);
    }
  });

  it('test_when_the_file_is_not_code_then_it_is_not_measured', () => {
    // Prose, data and templates have no layers to violate. Markdown in particular
    // was blocking on a security report this very phase produces.
    for (const path of [
      'docs/security/baseline-mcp-2026-08-22.md',
      'CLAUDE.md',
      'docs/init/seed.md',
      'site-src/org/setup.njk',
      'docs/design/mcp-page-before.png',
      'package-lock.json',
      '.github/workflows/release.yml',
      'docs/system/diagrams/baseline-tools.puml',
    ]) {
      assert.deepEqual(lengthFindings([file(path)]), [], `${path} must not be measured`);
    }
  });

  it('test_when_a_shipped_skill_helper_is_over_budget_then_it_is_still_measured', () => {
    // Excluding non-code must not quietly excuse the .mjs helpers under .claude/,
    // which are the bulk of this repository's own source.
    const found = lengthFindings([file('.claude/skills/harness/notify.mjs')]);
    assert.equal(found.length, 1);
  });

  it('test_when_the_comment_bar_is_applied_then_it_uses_the_same_scope', () => {
    // One scope for the checker, not one per check — a test file excused from the
    // length budget but measured for comment density would be half-fixed.
    const commentHeavy = (path) => ({
      path,
      content: 'const a = 1;\nconst b = 2;\n// why one\n// why two\n// why three\n// why four\n',
      prior: null,
    });
    const ratio = (path) =>
      runCodeStructureOracle({ changedFiles: [commentHeavy(path)] }).findings.filter((f) => f.check === 'comment_ratio');

    assert.equal(ratio('src/cli/thing.mjs').length, 1, 'source is still measured');
    assert.deepEqual(ratio('tests/thing.test.mjs'), [], 'a test file is not');
    assert.deepEqual(ratio('README.md'), [], 'nor is prose');
  });

  it('test_when_test_globs_are_supplied_then_they_are_honoured', () => {
    // A project whose tests live elsewhere says so; the built-in list is a default,
    // not a hard-coded assumption about every repository's layout.
    const custom = ['verification/**'];
    assert.deepEqual(
      runCodeStructureOracle({ changedFiles: [file('verification/thing.mjs')], testGlobs: custom }).findings,
      [],
      'a project-declared test path is excluded',
    );
    assert.equal(
      runCodeStructureOracle({ changedFiles: [file('tests/thing.test.mjs')], testGlobs: custom }).findings.length,
      1,
      'and supplying a list replaces the default rather than adding to it',
    );
  });

  it('test_when_the_predicate_is_asked_directly_then_it_answers_for_a_bare_path', () => {
    // Exported so a caller can scope a file list before paying to read it.
    assert.equal(isJudgedByCodeStructure('src/a.mjs'), true);
    assert.equal(isJudgedByCodeStructure('tests/a.test.mjs'), false);
    assert.equal(isJudgedByCodeStructure('docs/a.md'), false);
    assert.equal(isJudgedByCodeStructure(''), false);
    assert.equal(isJudgedByCodeStructure(null), false);
  });
});
