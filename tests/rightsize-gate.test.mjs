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
import { readFileSync } from 'node:fs';

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
const FORBIDDEN_IN_SKIP = ['security', 'integrate', 'tdd', 'archive', 'memory-flush', 'grant-commit', 'commit'];

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
