// rightsize-gate — Velocity Lever 2 (right-size phase-skip gate)
//
// Covers AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-011, AC-012 of
// rightsize-triage-drift-skip.
//
// After /tdd, rightsize-gate.mjs measures the real working-tree diff and decides
// which downstream phases a *micro* diff may skip. The gate must be:
//   (1) mechanical — the skip set is a pure function of file/line counts and glob
//       set-intersection, never LLM judgment;
//   (2) bounded — the skip allowlist is a hard subset of {simplify, document};
//       security is NEVER auto-skipped (human-decided, default runs);
//   (3) additive + fail-open — on any error / disabled config it returns an empty
//       skip and empty advisories (every phase runs — today's behavior).
//
// SUT: .claude/skills/harness/rightsize-gate.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let gate;
try {
  gate = await import(path.join(REPO_ROOT, '.claude/skills/harness/rightsize-gate.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/harness/rightsize-gate.mjs not yet implemented. Original: ${err.message}`
  );
}

const CONFIG = {
  enabled: true,
  min_files: 4,
  max_lines: 80,
  doc_globs: ['docs/**', '**/*.md', 'src/cli/**', 'bin/**'],
  sensitive_globs: ['.claude/hooks/**', '.claude/commands/**', 'src/cli/**', 'bin/**', '**/auth/**', '**/*.env*'],
};

const CANDIDATES = ['simplify', 'security', 'document'];
const FORBIDDEN_IN_SKIP = ['security', 'integrate', 'tdd', 'archive', 'memory-sync', 'grant-commit', 'commit'];

describe('rightsize-gate decideSkip — micro skip', () => {
  it('test_when_micro_diff_no_doc_then_skip_simplify_and_document', () => {
    const measure = { files: 2, lines: 30, touched: ['.claude/skills/x.mjs', 'a.mjs'] };
    const out = gate.decideSkip({ measure, config: CONFIG, securityRunning: true });
    assert.deepEqual([...out.skip].sort(), ['document', 'simplify']);
    assert.ok(!out.keep.includes('simplify'));
    assert.ok(!out.keep.includes('document'));
    assert.deepEqual(out.advisories, []);
  });

  it('test_when_any_diff_then_security_never_in_skip', () => {
    const cases = [
      { files: 1, lines: 5, touched: ['a.mjs'] },
      { files: 2, lines: 30, touched: ['.claude/hooks/h.mjs'] },
      { files: 9, lines: 400, touched: ['a.mjs', 'b.mjs'] },
    ];
    for (const measure of cases) {
      for (const securityRunning of [true, false]) {
        const out = gate.decideSkip({ measure, config: CONFIG, securityRunning });
        assert.ok(!out.skip.includes('security'), `security must never be skipped (${JSON.stringify(measure)})`);
      }
    }
  });

  it('test_when_doc_path_touched_then_document_kept', () => {
    const measure = { files: 1, lines: 10, touched: ['docs/x.md'] };
    const out = gate.decideSkip({ measure, config: CONFIG, securityRunning: true });
    assert.deepEqual(out.skip, ['simplify']);
    assert.ok(out.keep.includes('document'));
  });

  it('test_when_files_at_min_or_lines_over_then_skip_empty', () => {
    const atMinFiles = gate.decideSkip({ measure: { files: 4, lines: 10, touched: ['a', 'b', 'c', 'd'] }, config: CONFIG, securityRunning: true });
    assert.deepEqual(atMinFiles.skip, []);
    const overLines = gate.decideSkip({ measure: { files: 1, lines: 81, touched: ['a'] }, config: CONFIG, securityRunning: true });
    assert.deepEqual(overLines.skip, []);
  });

  it('test_when_disabled_then_fail_open_no_skip_no_advisory', () => {
    const out = gate.decideSkip({
      measure: { files: 1, lines: 1, touched: ['.claude/hooks/h.mjs'] },
      config: { ...CONFIG, enabled: false },
      securityRunning: false,
    });
    assert.deepEqual(out.skip, []);
    assert.deepEqual(out.advisories, []);
  });

  it('test_when_allowlist_then_subset_of_simplify_document', () => {
    const measures = [
      { files: 1, lines: 1, touched: ['a'] },
      { files: 3, lines: 79, touched: ['docs/y.md'] },
      { files: 2, lines: 20, touched: ['.claude/hooks/h.mjs'] },
      { files: 10, lines: 500, touched: ['a', 'b'] },
    ];
    for (const measure of measures) {
      for (const securityRunning of [true, false]) {
        const out = gate.decideSkip({ measure, config: CONFIG, securityRunning });
        for (const phase of out.skip) {
          assert.ok(['simplify', 'document'].includes(phase), `${phase} not in {simplify,document}`);
        }
        for (const forbidden of FORBIDDEN_IN_SKIP) {
          assert.ok(!out.skip.includes(forbidden), `${forbidden} must never be in skip`);
        }
      }
    }
  });
});

describe('rightsize-gate decideSkip — sensitive-surface advisory', () => {
  it('test_when_security_excepted_and_sensitive_touched_then_advisory', () => {
    const measure = { files: 2, lines: 20, touched: ['.claude/hooks/x.mjs', 'a.mjs'] };
    const out = gate.decideSkip({ measure, config: CONFIG, securityRunning: false });
    assert.equal(out.advisories.length, 1);
    assert.equal(out.advisories[0].kind, 'sensitive_surface_unreviewed');
    assert.deepEqual(out.advisories[0].paths, ['.claude/hooks/x.mjs']);
  });

  it('test_when_security_running_or_no_sensitive_then_no_advisory', () => {
    const sensitiveButRunning = gate.decideSkip({
      measure: { files: 2, lines: 20, touched: ['.claude/hooks/x.mjs'] },
      config: CONFIG, securityRunning: true,
    });
    assert.deepEqual(sensitiveButRunning.advisories, []);

    const skippedButClean = gate.decideSkip({
      measure: { files: 2, lines: 20, touched: ['a.mjs', 'b.mjs'] },
      config: CONFIG, securityRunning: false,
    });
    assert.deepEqual(skippedButClean.advisories, []);
  });
});

describe('rightsize-gate diff measurement', () => {
  it('test_when_numstat_then_measure_parses_files_lines_touched', () => {
    const numstat = '3\t1\ta.mjs\n5\t0\tb.mjs\n2\t0\tc.mjs';
    const rows = gate.parseNumstat(numstat);
    const m = gate.measureDiff(rows);
    assert.equal(m.files, 3);
    assert.equal(m.lines, 11); // (3+1)+(5+0)+(2+0)
    assert.deepEqual(m.touched, ['a.mjs', 'b.mjs', 'c.mjs']);
  });

  it('test_when_binary_numstat_row_then_counts_file_zero_lines', () => {
    const rows = gate.parseNumstat('-\t-\timg.png\n4\t0\ta.mjs');
    const m = gate.measureDiff(rows);
    assert.equal(m.files, 2);
    assert.equal(m.lines, 4);
  });

  it('test_matchesAnyGlob_doublestar_and_extension', () => {
    assert.ok(gate.matchesAnyGlob('.claude/hooks/deep/x.mjs', ['.claude/hooks/**']));
    assert.ok(gate.matchesAnyGlob('docs/a/b.md', ['docs/**']));
    assert.ok(gate.matchesAnyGlob('README.md', ['**/*.md']));
    assert.ok(!gate.matchesAnyGlob('a.mjs', ['docs/**', '**/*.md']));
  });
});

describe('rightsize-gate main — fail-open', () => {
  it('test_when_exec_throws_then_main_exit_0', async () => {
    const exec = () => { throw new Error('git boom'); };
    const code = await gate.main(['check', 'slugX'], {
      rootDir: '/nonexistent',
      exec,
      project: CONFIG,
      workflow: { exceptions: [] },
    });
    assert.equal(code, 0); // fail-open
  });
});

describe('AC-011 — Article IV amendment landed + mirror-consistent + under cap', () => {
  it('test_when_constitution_amended_then_gate_sanctioned_and_within_budget', () => {
    const claude = readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8');
    const template = readFileSync(path.join(REPO_ROOT, 'src/CLAUDE.template.md'), 'utf8');
    // The right-size gate is named as a sanctioned skip mechanism in Article IV.
    assert.match(claude, /right-size gate/);
    assert.match(claude, /rightsize-gate\.mjs/);
    // src mirror stays byte-equal; CLAUDE.md stays under the 40000-char hard cap.
    assert.equal(claude, template, 'CLAUDE.md must be byte-equal to src/CLAUDE.template.md');
    assert.ok(Buffer.byteLength(claude, 'utf8') <= 40000, 'CLAUDE.md within 40000-char cap');
    // seed.md (governing) carries the full rule per Article I.4 precedence.
    const seed = readFileSync(path.join(REPO_ROOT, 'docs/init/seed.md'), 'utf8');
    assert.match(seed, /Right-size gate \(second sanctioned skip mechanism/);
  });
});

// ---------------------------------------------------------------------------
// rightsize-gate-fix — D1 (exclude test lines) + D2 (scope to workflow diff)
// New exports under test: configFromProject, filterRows, parsePorcelain,
// captureBaseline, applyBaseline, and main's `baseline` subcommand.
//
// Coverage map (rightsize-gate-fix spec):
//   AC-001 (test lines excluded)        — test_globs / filterRows / measure blocks below
//   AC-003 (baseline capture, idempotent) — parsePorcelain / captureBaseline / applyBaseline
//   AC-004 (baseline paths excluded)     — filterRows-with-basePaths block
//   AC-005 (fail-safe whole-tree + fail-open) — identity + main-baseline blocks
//   AC-002 (security never in skip) and AC-006 (skip subset of {simplify,document})
//     are the pre-existing invariant tests above (test_when_any_diff_then_security_never_in_skip,
//     test_when_allowlist_then_subset_of_simplify_document) — kept green, not duplicated.
// ---------------------------------------------------------------------------

const TEST_GLOBS = ['tests/**', 'test/**', '**/*.test.*', '**/*.spec.*'];
const CONFIG_T = { ...CONFIG, test_globs: TEST_GLOBS };

describe('rightsize-gate-fix D1 — test lines excluded from measurement', () => {
  it('test_when_test_globs_configured_then_test_rows_excluded', () => {
    const rows = [
      { added: 2, deleted: 0, path: 'src/x.mjs' },
      { added: 100, deleted: 0, path: 'tests/x.test.mjs' },
    ];
    const kept = gate.filterRows(rows, { testGlobs: TEST_GLOBS, basePaths: [] });
    const m = gate.measureDiff(kept);
    assert.equal(m.files, 1);
    assert.equal(m.lines, 2);
    assert.deepEqual(m.touched, ['src/x.mjs']);
  });

  it('test_when_only_test_files_then_measure_zero_and_micro', () => {
    const rows = [
      { added: 60, deleted: 0, path: 'tests/a.test.mjs' },
      { added: 40, deleted: 0, path: 'tests/b.test.mjs' },
    ];
    const kept = gate.filterRows(rows, { testGlobs: TEST_GLOBS, basePaths: [] });
    const measure = gate.measureDiff(kept);
    assert.equal(measure.files, 0);
    assert.equal(measure.lines, 0);
    const out = gate.decideSkip({ measure, config: CONFIG_T, securityRunning: true });
    assert.deepEqual([...out.skip].sort(), ['document', 'simplify']);
    assert.ok(!out.skip.includes('security'));
  });

  it('test_when_test_glob_also_doc_glob_then_dropped_before_doc_check', () => {
    const rows = [{ added: 10, deleted: 0, path: 'tests/x.test.md' }];
    const kept = gate.filterRows(rows, { testGlobs: TEST_GLOBS, basePaths: [] });
    assert.deepEqual(kept, []);
    const out = gate.decideSkip({ measure: gate.measureDiff(kept), config: CONFIG_T, securityRunning: true });
    // the test-doc file was dropped, so `document` is skipped, not spuriously kept.
    assert.ok(out.skip.includes('document'));
  });

  it('test_when_configFromProject_then_test_globs_read_or_default_empty', () => {
    assert.deepEqual(gate.configFromProject({ tdd: { test_globs: ['tests/**'] } }).test_globs, ['tests/**']);
    assert.deepEqual(gate.configFromProject({}).test_globs, []);
    assert.deepEqual(gate.configFromProject(undefined).test_globs, []);
  });
});

describe('rightsize-gate-fix D2 — baseline capture + exclusion', () => {
  it('test_when_porcelain_then_parsePorcelain_returns_paths', () => {
    const porcelain = ' M b.mjs\n?? a.md\nA  c.mjs\nR  old -> new\n';
    assert.deepEqual(gate.parsePorcelain(porcelain), ['b.mjs', 'a.md', 'c.mjs', 'new']);
  });

  it('test_when_captureBaseline_then_returns_dirty_untracked_paths', () => {
    const exec = (cmd, args) => {
      assert.equal(cmd, 'git');
      assert.ok(args.includes('status') && args.includes('--porcelain'));
      return ' M b.mjs\n?? a.md\n';
    };
    assert.deepEqual(gate.captureBaseline({ rootDir: '/repo', exec }), ['b.mjs', 'a.md']);
  });

  it('test_when_captureBaseline_exec_throws_then_empty', () => {
    const exec = () => { throw new Error('git boom'); };
    assert.deepEqual(gate.captureBaseline({ rootDir: '/repo', exec }), []);
  });

  it('test_when_applyBaseline_field_absent_then_set_else_noop', () => {
    const fresh = gate.applyBaseline({ slug: 's' }, ['a.md', 'b.mjs']);
    assert.deepEqual(fresh.rightsize_base, ['a.md', 'b.mjs']);
    const existing = gate.applyBaseline({ slug: 's', rightsize_base: ['x'] }, ['a.md']);
    assert.deepEqual(existing.rightsize_base, ['x']);
  });

  it('test_when_rightsize_base_set_then_filterRows_excludes_those_paths', () => {
    const rows = [
      { added: 5, deleted: 0, path: 'src/x.mjs' },
      { added: 200, deleted: 0, path: 'old-shard.md' },
      { added: 90, deleted: 0, path: 'x.test.mjs' },
    ];
    const kept = gate.filterRows(rows, { testGlobs: TEST_GLOBS, basePaths: ['old-shard.md'] });
    const m = gate.measureDiff(kept);
    assert.deepEqual(m.touched, ['src/x.mjs']);
    assert.equal(m.lines, 5);
  });
});

describe('rightsize-gate-fix — fail-safe (whole-tree preserved)', () => {
  it('test_when_no_base_and_no_test_globs_then_whole_tree_measure', () => {
    const rows = [
      { added: 5, deleted: 1, path: 'src/x.mjs' },
      { added: 100, deleted: 0, path: 'tests/x.test.mjs' },
    ];
    assert.deepEqual(gate.filterRows(rows, { testGlobs: [], basePaths: [] }), rows);
  });

  it('test_when_main_baseline_exec_throws_then_exit_0', async () => {
    const exec = () => { throw new Error('git boom'); };
    const code = await gate.main(['baseline', '--slug', 's'], {
      rootDir: '/nonexistent',
      exec,
      project: CONFIG_T,
      workflow: { exceptions: [] },
    });
    assert.equal(code, 0);
  });
});

describe('rightsize-gate-fix — check loads project.json from disk (end-to-end D1)', () => {
  // The CLI `check` path receives no injected project; test_globs must come from
  // the on-disk .claude/project.json, else D1 is inert in production.
  it('test_when_check_no_injected_project_then_test_globs_from_disk_exclude_test_rows', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'rsg-'));
    try {
      mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
      writeFileSync(path.join(root, '.claude', 'project.json'), JSON.stringify({
        tdd: { test_globs: ['tests/**', '**/*.test.*'] },
        velocity: { rightsize: { enabled: true, max_lines: 80 } },
        simplify: { min_files: 4 },
      }));
      writeFileSync(path.join(root, '.claude', 'state', 'workflow.json'), JSON.stringify({ slug: 's', exceptions: [] }));
      const exec = (cmd, args) => {
        if (args.includes('--numstat') && args.includes('HEAD')) return '2\t0\tsrc/x.mjs\n100\t0\ttests/x.test.mjs\n';
        if (args.includes('ls-files')) return '';
        return '';
      };
      let out = '';
      const orig = process.stdout.write;
      process.stdout.write = (s) => { out += s; return true; };
      let code;
      try {
        // NOTE: no `project` in deps — it must be read from disk at rootDir.
        code = await gate.main(['check', '--slug', 's'], { rootDir: root, exec });
      } finally {
        process.stdout.write = orig;
      }
      assert.equal(code, 0);
      const result = JSON.parse(out);
      assert.deepEqual(result.measured.touched, ['src/x.mjs']);
      assert.equal(result.measured.lines, 2);
      assert.ok(result.skip.includes('simplify'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// AC-009 — rightsize_base excludes an untracked path.
//
// The baseline snapshot stores plain repo-relative paths; an untracked file
// arrives from the diff as `/dev/null => <path>`, so the bare string compare in
// filterRows never matches and every pre-existing UNTRACKED path is measured
// anyway. Tracked paths exclude correctly — only the untracked half is broken.
//
// Blast radius is one-directional: the gate is fail-open and additive-only, so
// the failure inflates the measure and makes it MORE likely to KEEP simplify and
// document. It cannot cause a wrongful skip. That is why this is a precision fix
// and not a safety one — and why the regression row below matters as much as the
// new one.
describe('rightsize-gate — the base list and the diff share a vocabulary (AC-009)', () => {
  const UNTRACKED_ROW = { path: '/dev/null => docs/audits/note.md', added: 40, removed: 0 };

  it('test_when_untracked_path_in_rightsize_base_then_row_is_excluded', () => {
    const kept = gate.filterRows([UNTRACKED_ROW], {
      testGlobs: [],
      basePaths: ['docs/audits/note.md'],
    });

    assert.deepEqual(kept, [],
      'a pre-existing untracked path sits in rightsize_base precisely so it is excluded; ' +
      'the diff renders it as `/dev/null => <path>` and the comparison must normalise ' +
      'both sides through one helper rather than comparing two vocabularies');
  });

  it('test_when_tracked_path_in_rightsize_base_then_row_is_still_excluded', () => {
    const kept = gate.filterRows([{ path: 'docs/audits/tracked.md', added: 5, removed: 1 }], {
      testGlobs: [],
      basePaths: ['docs/audits/tracked.md'],
    });

    assert.deepEqual(kept, [],
      'the tracked half already worked; normalising must not break it');
  });

  it('test_when_untracked_path_absent_from_base_then_row_survives', () => {
    const kept = gate.filterRows([UNTRACKED_ROW], { testGlobs: [], basePaths: [] });

    assert.equal(kept.length, 1,
      'normalisation must not turn into a blanket exclusion of untracked adds — a file ' +
      'this workflow actually created is real change and must still be measured');
  });
});
