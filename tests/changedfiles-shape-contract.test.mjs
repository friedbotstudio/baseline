// The ctx.changedFiles element contract (docs/specs/changedfiles-shape-contract.md).
//
// The producer emitted path strings; `code-structure` and `backlog-deferral` both read
// {path, content} objects. Against a string `file.content` is undefined, so the length
// check compared 0 to 80 and the path guard skipped every file — two checkers returning
// {findings: []} with no error and no skip marker, spelled exactly like a real pass.
//
// These tests pin the element type, the severity split that lets the gate block without
// freezing the 93 files already over budget, and the assertion that fails loudly when a
// future checker is fed the wrong shape.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ASSEMBLER = path.join(ROOT, '.claude/skills/harness/assemble-context.mjs');
const FANOUT = path.join(ROOT, '.claude/skills/harness/checker-fanout.mjs');
const ORACLE = path.join(ROOT, '.claude/skills/code-structure/oracle.mjs');
const MUTATION = path.join(ROOT, '.claude/skills/harness/checkers/mutation-score.mjs');
const DEFERRAL = path.join(ROOT, '.claude/skills/harness/checkers/backlog-deferral.mjs');
const INTEGRATE_SOP = path.join(ROOT, '.claude/skills/integrate/SKILL.md');

const BUDGET = 80;

// ─── Foundation: fixture builders ───

function contentWith(substantiveLines) {
  return Array.from({ length: substantiveLines }, (_, i) => `const line${i} = ${i};`).join('\n');
}

function changed(filePath, lines, priorLines) {
  return {
    path: filePath,
    content: contentWith(lines),
    prior: priorLines === null ? null : contentWith(priorLines),
  };
}

// exec and readFile are parameters of the producer's public API, so injecting them is
// dependency injection rather than mocking an internal module (Art. VI.3).
function execStub({ diff, show }) {
  return (rootDir, args) => {
    if (args[0] === 'diff') {
      if (typeof diff === 'function') return diff();
      return diff;
    }
    if (args[0] === 'show') {
      if (typeof show === 'function') return show(args[1]);
      return show;
    }
    throw new Error(`unexpected git args: ${args.join(' ')}`);
  };
}

function readFileStub(byPath) {
  return (filePath) => {
    const key = Object.keys(byPath).find((k) => filePath.endsWith(k));
    if (key === undefined) {
      const err = new Error(`ENOENT: ${filePath}`);
      err.code = 'ENOENT';
      throw err;
    }
    return byPath[key];
  };
}

const alwaysMandatory = () => ({ mandatory: true });

function tempRepo(slug) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cfshape-'));
  mkdirSync(path.join(dir, 'docs/specs'), { recursive: true });
  writeFileSync(path.join(dir, `docs/specs/${slug}.md`), '# fixture spec\n');
  return dir;
}

function fileLengthFindings(findings) {
  return findings.filter((f) => f.check === 'file_length');
}

let assembler;
let fanout;
let oracle;
let mutation;
let deferral;

before(async () => {
  assembler = await import(ASSEMBLER);
  fanout = await import(FANOUT);
  oracle = await import(ORACLE);
  mutation = await import(MUTATION);
  deferral = await import(DEFERRAL);
});

// ─── AC-001, AC-004: the producer hydrates ───

describe('assembleContext — the declared element type (AC-001, AC-004)', () => {
  it('test_when_context_assembled_then_elements_are_hydrated_objects', () => {
    const result = assembler.assembleContext({
      rootDir: '/repo',
      exec: execStub({ diff: 'a.mjs\nb.mjs\n', show: 'prior body\n' }),
      readFile: readFileStub({ 'a.mjs': 'working a\n', 'b.mjs': 'working b\n' }),
    });

    assert.equal(result.changedFiles.length, 2, 'both changed paths hydrate');
    for (const [index, file] of result.changedFiles.entries()) {
      assert.equal(typeof file, 'object',
        `element ${index} must be a ChangedFile object, not a bare path string — ` +
        'a string makes file.content undefined and the code-structure checker vacuous');
      assert.equal(typeof file.path, 'string', `element ${index} carries a path`);
      assert.equal(typeof file.content, 'string', `element ${index} carries working-tree content`);
      assert.ok(file.prior === null || typeof file.prior === 'string',
        `element ${index} carries prior as content or null`);
    }
    assert.equal(result.inputState, 'measured', 'files were examined');
  });

  it('test_when_diff_path_is_deleted_then_it_is_dropped_and_siblings_hydrate', () => {
    const result = assembler.assembleContext({
      rootDir: '/repo',
      exec: execStub({ diff: 'gone.mjs\nkept.mjs\n', show: 'prior body\n' }),
      readFile: readFileStub({ 'kept.mjs': 'still here\n' }),
    });

    assert.deepEqual(result.changedFiles.map((f) => f.path), ['kept.mjs'],
      'a path deleted from the working tree is dropped rather than throwing');
    assert.equal(result.changedFiles[0].content, 'still here\n', 'the sibling hydrates normally');
  });

  it('test_when_head_lookup_fails_then_prior_is_null_and_hydration_continues', () => {
    const result = assembler.assembleContext({
      rootDir: '/repo',
      exec: execStub({
        diff: 'fresh.mjs\n',
        show: () => { throw new Error('fatal: path does not exist in HEAD'); },
      }),
      readFile: readFileStub({ 'fresh.mjs': 'brand new\n' }),
    });

    assert.equal(result.changedFiles.length, 1, 'a file absent from HEAD still hydrates');
    assert.equal(result.changedFiles[0].prior, null,
      'no HEAD version means prior is null — the file is new, so its length is this change to own');
  });

  it('test_when_git_probe_throws_then_changed_files_empty_and_input_state_no_input', () => {
    const result = assembler.assembleContext({
      rootDir: '/repo',
      exec: execStub({ diff: () => { throw new Error('git exploded'); }, show: '' }),
      readFile: readFileStub({}),
    });

    assert.deepEqual(result.changedFiles, [], 'a failed probe yields no elements');
    assert.equal(result.inputState, 'no-input',
      'a probe that could not run must never render as a clean review');
  });

  it('test_when_assemble_changed_files_is_called_then_it_still_returns_path_strings', () => {
    const paths = assembler.assembleChangedFiles({
      rootDir: '/repo',
      exec: execStub({ diff: 'a.mjs\nb.mjs\n', show: '' }),
    });

    assert.deepEqual(paths, ['a.mjs', 'b.mjs'],
      'the git probe stays separable from the content read; hydration is assembleContext (spec D1)');
  });
});

// ─── AC-002, AC-003: the oracle stops being vacuous, without freezing the repo ───

describe('code-structure oracle — real findings and honest severity (AC-002, AC-003)', () => {
  it('test_when_over_budget_file_fed_through_producer_then_code_structure_finds_it', () => {
    const body = contentWith(120);
    const { changedFiles } = assembler.assembleContext({
      rootDir: '/repo',
      exec: execStub({ diff: 'big.mjs\n', show: body }),
      readFile: readFileStub({ 'big.mjs': body }),
    });

    const { findings } = oracle.runCodeStructureOracle({ changedFiles }, { tierDial: alwaysMandatory });

    const lengths = fileLengthFindings(findings);
    assert.equal(lengths.length, 1,
      'a 120-line file hydrated by the real producer must trip the length check — ' +
      'every archived checker-fanout-code verdict read CLEAN because this returned []');
    assert.equal(lengths[0].file, 'big.mjs', 'the finding names the offending path');
  });

  it('test_when_file_is_at_budget_then_no_finding_and_one_line_over_then_finding', () => {
    const atBudget = oracle.runCodeStructureOracle(
      { changedFiles: [changed('exact.mjs', BUDGET, BUDGET)] }, { tierDial: alwaysMandatory });
    const overBudget = oracle.runCodeStructureOracle(
      { changedFiles: [changed('over.mjs', BUDGET + 1, 0)] }, { tierDial: alwaysMandatory });

    assert.equal(fileLengthFindings(atBudget.findings).length, 0, `${BUDGET} lines is within budget`);
    assert.equal(fileLengthFindings(overBudget.findings).length, 1, `${BUDGET + 1} lines is over`);
  });

  it('test_when_prior_was_over_budget_then_file_length_finding_is_advisory', () => {
    const { findings } = oracle.runCodeStructureOracle(
      { changedFiles: [changed('inherited.mjs', 200, 190)] }, { tierDial: alwaysMandatory });

    const [finding] = fileLengthFindings(findings);
    assert.ok(finding, 'inherited debt is still named on every touch');
    assert.equal(finding.severity, 'ADVISORY',
      'the file was already over budget before this change — blocking here freezes the 93 ' +
      'baseline-owned files already over it, which is what D2 exists to prevent');
  });

  it('test_when_prior_was_under_budget_then_file_length_finding_is_blocker', () => {
    const { findings } = oracle.runCodeStructureOracle(
      { changedFiles: [changed('introduced.mjs', 120, 40)] }, { tierDial: alwaysMandatory });

    const [finding] = fileLengthFindings(findings);
    assert.ok(finding, 'a file pushed over budget is reported');
    assert.equal(finding.severity, 'BLOCKER',
      'this change pushed the file over — that debt is the change\'s own');
  });

  it('test_when_file_is_new_then_prior_is_null_and_finding_is_blocker', () => {
    const { findings } = oracle.runCodeStructureOracle(
      { changedFiles: [changed('brand-new.mjs', 120, null)] }, { tierDial: alwaysMandatory });

    const [finding] = fileLengthFindings(findings);
    assert.ok(finding, 'a new over-budget file is reported');
    assert.equal(finding.severity, 'BLOCKER',
      'a file this change created carries no inherited debt to excuse it');
  });
});

// ─── AC-005, AC-006: the other two consumers read the same element ───

describe('the remaining code-review consumers (AC-005, AC-006)', () => {
  it('test_when_mutation_adapter_reads_objects_then_target_matches_the_string_list', async () => {
    const paths = ['lib/argv.mjs', 'lib/argv.test.mjs'];
    const fromStrings = mutation.resolveMutationTarget(paths);
    assert.ok(fromStrings, 'the fixture pair resolves a target from bare paths');

    const dir = mkdtempSync(path.join(tmpdir(), 'cfshape-mut-'));
    try {
      mkdirSync(path.join(dir, '.claude'), { recursive: true });
      writeFileSync(path.join(dir, '.claude/project.json'),
        JSON.stringify({ velocity: { mutation_oracle: { enabled: true } } }));

      const seen = [];
      await mutation.mutationScoreAdapter.run({
        rootDir: dir,
        changedFiles: paths.map((p) => ({ path: p, content: '', prior: null })),
        oracleRunner: (module, test) => { seen.push({ module, test }); return 1; },
      });

      assert.deepEqual(seen, [fromStrings],
        'the adapter must reach its runner with the same target the bare path list resolves — ' +
        'handed ChangedFile objects it resolved nothing and the oracle never ran');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('test_when_backlog_file_fed_through_producer_then_deferral_checker_inspects_it', () => {
    const entry = [
      '---',
      'key: some-deferred-thing-1a2b',
      'category: backlog',
      'status: open',
      'source: assistant-deferral',
      '---',
      '',
      '> Some deferred follow-up.',
      '',
    ].join('\n');
    const rel = '.claude/memory/backlog/some-deferred-thing-1a2b.md';

    const { changedFiles } = assembler.assembleContext({
      rootDir: '/repo',
      exec: execStub({ diff: `${rel}\n`, show: entry }),
      readFile: readFileStub({ [rel]: entry }),
    });

    const { findings } = deferral.run({ changedFiles });

    assert.equal(findings.length, 1,
      'an untagged assistant deferral hydrated by the real producer must be inspected — ' +
      'against a bare string the path guard skipped every file');
    assert.equal(findings[0].check, 'deferral_untagged', 'the checker read the frontmatter, not just the path');
  });
});

// ─── AC-008: the shape fails loudly ───

describe('assertChangedFilesShape — the loud one (AC-008)', () => {
  it('test_when_changed_files_holds_a_string_then_fanout_throws_type_error', async () => {
    const dir = tempRepo('fixture');
    try {
      await assert.rejects(
        () => fanout.runCheckerFanout({
          slug: 'fixture',
          rootDir: dir,
          enabled: true,
          phase: 'code-review',
          ctx: { changedFiles: ['a.mjs'] },
        }),
        (err) => {
          assert.ok(err instanceof TypeError, 'a malformed ctx is a TypeError');
          assert.match(err.message, /0/, 'the message names the offending index');
          assert.match(err.message, /string/, 'the message names the actual type');
          return true;
        },
        'every function on this path is fail-open by contract, which is why the defect was ' +
        'silent — the shape check is deliberately the one that throws',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('test_when_changed_files_element_lacks_content_then_fanout_throws_type_error', async () => {
    const dir = tempRepo('fixture');
    try {
      await assert.rejects(
        () => fanout.runCheckerFanout({
          slug: 'fixture',
          rootDir: dir,
          enabled: true,
          phase: 'code-review',
          ctx: { changedFiles: [{ path: 'a.mjs' }] },
        }),
        (err) => {
          assert.ok(err instanceof TypeError, 'a half-built element is a TypeError');
          assert.match(err.message, /0/, 'the message names the offending index');
          return true;
        },
        'a half-built element must not read as a valid one',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('test_when_assert_changed_files_shape_is_exported_then_it_accepts_a_conforming_array', () => {
    assert.equal(typeof assembler.assertChangedFilesShape, 'function',
      'the producer owns the shape assertion, so the guard travels with the type it declares');
    assert.doesNotThrow(() => assembler.assertChangedFilesShape([changed('ok.mjs', 5, 5)]));
    assert.doesNotThrow(() => assembler.assertChangedFilesShape([]),
      'an empty list is a measured zero, not a malformed one');
  });
});

// ─── AC-007: the SOP names the type ───

describe('integrate SOP names the element type (AC-007)', () => {
  it('test_when_integrate_sop_is_read_then_step_3_5_names_the_element_type', () => {
    const sop = readFileSync(INTEGRATE_SOP, 'utf8');
    const step = /^3\.5\..*$/m.exec(sop);
    assert.ok(step, 'Step 3.5 is present in the integrate SOP');

    const paragraph = step[0];
    for (const field of ['path', 'content', 'prior']) {
      assert.match(paragraph, new RegExp(`\\b${field}\\b`),
        `Step 3.5 must name \`${field}\` — the paragraph named changedFiles without its element ` +
        'type, so main context guessed the shape per run and two checkers went vacuous');
    }
  });
});

// ─── AC-009, AC-010: one severity rule for file length, wherever it is applied ───
//
// D2 taught `code-structure` that length already present at HEAD is inherited debt.
// `simplify/oracle.mjs` grades the same fact off the rendered verdict table and emitted a
// BLOCKER for every flagged row, so the correct ADVISORY was overridden at the merge and
// the landing blocked on debt the change did not create. It blocked workspace-corpus-backfill
// on 2026-08-06 the same way. The oracle has no `prior` to recompute from, so the reviewer
// declares inheritance with an anchored prefix and the SOP is what tells them to.

const SIMPLIFY_ORACLE = path.join(ROOT, '.claude/skills/simplify/oracle.mjs');
const SIMPLIFY_SOP = path.join(ROOT, '.claude/skills/simplify/SKILL.md');

function verdictTable(rows) {
  return [
    '| file | verdict | reason |',
    '|---|---|---|',
    ...rows.map(([file, verdict, reason]) => `| ${file} | ${verdict} | ${reason} |`),
  ].join('\n');
}

const neverMandatory = () => ({ mandatory: false });

let simplifyOracle;

before(async () => {
  simplifyOracle = await import(SIMPLIFY_ORACLE);
});

describe('simplify oracle — inherited debt is named, not blocking (AC-009)', () => {
  function runTable(rows, tierDial = alwaysMandatory) {
    return simplifyOracle.runSimplifyOracle({ simplifyTable: verdictTable(rows) }, { tierDial });
  }

  it('test_when_flagged_row_declares_inherited_then_finding_is_advisory', () => {
    const { findings } = runTable([['a.mjs', 'flagged', 'inherited: 149 lines; over budget at HEAD']]);

    assert.equal(findings.length, 1, 'the row is still named — inherited debt is reported, not hidden');
    assert.equal(findings[0].severity, 'ADVISORY',
      'a file already over budget at HEAD carries debt this change did not create; blocking on it ' +
      'freezes the 93 baseline files already over budget (D2, D4)');
  });

  it('test_when_flagged_row_reason_is_ordinary_then_finding_is_blocker', () => {
    const { findings } = runTable([['a.mjs', 'flagged', 'extract the retry loop']]);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'BLOCKER',
      'an undeclared flag keeps the tier-dial severity — only inheritance downgrades it');
  });

  it('test_when_reason_only_contains_inherited_then_finding_is_blocker', () => {
    const { findings } = runTable([['a.mjs', 'flagged', 'not inherited: a fresh 300-line module']]);

    assert.equal(findings[0].severity, 'BLOCKER',
      'the prefix anchors at the start of the reason cell; a reason that merely contains the ' +
      'word must not downgrade, or the rule becomes prose matching (D4)');
  });

  it('test_when_flagged_row_has_no_reason_then_finding_is_blocker', () => {
    const { findings } = runTable([['a.mjs', 'flagged', '']]);

    assert.equal(findings.length, 1,
      'an unreasoned flag must not vanish from the gate — a row with no reason used to parse to ' +
      'two cells and emit nothing at all');
    assert.equal(findings[0].severity, 'BLOCKER', 'an absent reason is not an inheritance claim');
  });

  it('test_when_unprefixed_table_runs_then_severity_matches_today', () => {
    const rows = [
      ['a.mjs', 'flagged', 'extract the retry loop'],
      ['b.mjs', 'clean', 'nothing to do'],
      ['c.mjs', 'flagged', 'single-implementation interface'],
    ];

    const blocking = runTable(rows, alwaysMandatory).findings;
    assert.equal(blocking.length, 2, 'both flagged rows are named; the clean row is not');
    assert.ok(blocking.every((f) => f.severity === 'BLOCKER'),
      'every existing verdict table carries no prefix, so its severity is byte-unchanged');

    const advisory = runTable(rows, neverMandatory).findings;
    assert.ok(advisory.every((f) => f.severity === 'ADVISORY'),
      'an unprefixed row still follows the tier dial in both directions');
  });

  it('test_when_this_branch_table_runs_then_inherited_row_is_advisory_and_merge_is_clean', () => {
    const { findings } = runTable([
      ['.claude/skills/harness/assemble-context.mjs', 'cleaned', 'hydration extracted to one helper'],
      ['.claude/skills/harness/checker-fanout.mjs', 'flagged', 'inherited: 149 lines; over budget at HEAD'],
      ['.claude/skills/code-structure/oracle.mjs', 'clean', 'severity split reads at one level'],
    ]);

    assert.equal(findings.length, 1, 'only the flagged row produces a finding');
    assert.equal(findings[0].file, '.claude/skills/harness/checker-fanout.mjs');
    const merged = fanout.mergeVerdicts([{ checker: 'simplify', findings, verdict: 'CLEAN' }]);
    assert.equal(merged.verdict, 'CLEAN',
      'checker-fanout.mjs was 148 substantive lines before this branch touched it, so the branch ' +
      'must land on the strength of what it introduced, not what it inherited');
  });
});

describe('simplify SOP directs the inherited prefix (AC-010)', () => {
  it('test_when_simplify_sop_is_read_then_the_flagged_rule_directs_the_inherited_prefix', () => {
    const sop = readFileSync(SIMPLIFY_SOP, 'utf8');

    assert.match(sop, /`inherited:`/,
      'the oracle reads a prefix no reviewer is told to write, so the rule would sit inert and ' +
      'inherited debt would keep blocking — the producer/consumer split this spec exists to fix');
    assert.match(sop, /inherited:[\s\S]{0,400}?\bHEAD\b/,
      'the prefix rule must name HEAD as the measurement point, or "already over budget" is a ' +
      'judgement call rather than something the reviewer measured');
  });
});
