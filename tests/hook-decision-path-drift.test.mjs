// Scenarios for the hook-decision-path-drift landing (RCA
// docs/rca/2026-08-06-harness-continuation-false-misfire.md, items AI-01/AI-02/AI-03).
//
// The RCA's finding: `harness_continuation.mjs` implements a disjunctive gate
// (Path A mid-loop continuation, Path B consent-resume), `docs/init/seed.md`
// documents both, but three derived governance docs describe only a "three-rung
// gate" that is "silent otherwise". Nothing mechanical compared a hook's
// implemented decision paths against its documented ones, so the drift survived
// two commits and produced a false defect report.
//
// AI-02's oracle targets the ANNEX (`.claude/CONSTITUTION.md`), not seed.md and
// not CLAUDE.md. seed.md was correct throughout, so checking it would have caught
// nothing; CLAUDE.md is capped at 40,000 chars and Article VIII delegates fuller
// per-hook behavior to the annex by design.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRepoAudit } from './helpers/audit-repo.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let runDecisionPaths;
let buildContext;
try {
  ({ run: runDecisionPaths } = await import(
    '../.claude/skills/audit-baseline/checks/hook-decision-paths.mjs'
  ));
  ({ buildContext } = await import('../.claude/skills/audit-baseline/checks/context.mjs'));
} catch (err) {
  throw new Error(
    'hook-decision-path-drift scenarios need ' +
      '.claude/skills/audit-baseline/checks/hook-decision-paths.mjs exporting run(ctx). ' +
      `Import failed: ${err.message}`,
  );
}

// Foundation: a ctx stub in the shape every checks/ module already consumes —
// `listDir` for the hook roster, `readText` for file bodies.
function stubCtx({ hooks, annex }) {
  const files = { '.claude/CONSTITUTION.md': annex, ...hooks };
  return {
    root: REPO_ROOT,
    listDir: (rel) =>
      rel === '.claude/hooks'
        ? Object.keys(hooks).map((p) => p.replace('.claude/hooks/', ''))
        : [],
    readText: (rel) => files[rel] ?? '',
  };
}

const TWO_PATH_HOOK = `
// Gate has two disjunctive paths:
//   Path A (mid-loop continuation)
//   Path B (rung 4 — gate-resume after a consent slash command)
let emitLogDetail = '';
if (stateValue === 'continue') emitLogDetail = 'Path A (state=continue + marker present)';
else if (stateValue === 'yielded') emitLogDetail = 'Path B (rung 4, state=yielded + fresh consent)';
`;

const failRowsFor = (rows, hook) =>
  rows.filter(([name, status]) => name.includes(hook) && status === 'FAIL');

describe('hook decision paths — the annex must name every path a hook implements', () => {
  it('test_when_hook_declares_path_label_absent_from_annex_then_fail', () => {
    const ctx = stubCtx({
      hooks: { '.claude/hooks/demo_gate.mjs': TWO_PATH_HOOK },
      annex: '- **`demo_gate`** (Stop) — Three-rung gate. Path A fires mid-loop. Silent on any rung fail.',
    });

    const rows = runDecisionPaths(ctx);
    const failures = failRowsFor(rows, 'demo_gate');

    assert.equal(failures.length, 1, 'an undocumented path must produce exactly one FAIL row');
    assert.match(
      failures[0][2],
      /Path B/,
      'the FAIL detail must name the undocumented path, not just report a mismatch',
    );
  });

  it('test_when_annex_documents_every_declared_path_then_pass', () => {
    const ctx = stubCtx({
      hooks: { '.claude/hooks/demo_gate.mjs': TWO_PATH_HOOK },
      annex:
        '- **`demo_gate`** (Stop) — Disjunctive gate. Path A is the mid-loop safety net; ' +
        'Path B resumes after a consent slash command.',
    });

    const rows = runDecisionPaths(ctx);

    assert.deepEqual(failRowsFor(rows, 'demo_gate'), [], 'a fully documented hook must not FAIL');
    assert.ok(
      rows.some(([name, status]) => name.includes('demo_gate') && status === 'PASS'),
      'a fully documented hook must report a PASS row, not silence',
    );
  });

  it('test_when_hook_declares_no_path_labels_then_it_is_skipped_not_failed', () => {
    const ctx = stubCtx({
      hooks: { '.claude/hooks/plain_guard.mjs': 'if (bad) deny("no"); else allow();' },
      annex: '- **`plain_guard`** (PreToolUse) — Blocks the bad thing.',
    });

    const rows = runDecisionPaths(ctx);

    assert.deepEqual(
      failRowsFor(rows, 'plain_guard'),
      [],
      'a hook with no path-label convention must not be punished for lacking one',
    );
    const coverage = rows.find(([name]) => name.includes('coverage'));
    assert.ok(coverage, 'the check must emit a coverage row so its narrowness stays visible');
    assert.match(
      coverage[2],
      /0 of 1/,
      'the coverage detail must state how many hooks were actually covered',
    );
  });
});

describe('hook decision paths — the live repo', () => {
  it('test_when_live_repo_scanned_then_harness_continuation_paths_are_documented', () => {
    const ctx = buildContext({ root: REPO_ROOT, skipHashCheck: true });

    const rows = runDecisionPaths(ctx);
    const failures = rows.filter(([, status]) => status === 'FAIL');

    assert.deepEqual(
      failures.map(([name, , detail]) => `${name}: ${detail}`),
      [],
      'every path a live hook implements must be named in .claude/CONSTITUTION.md',
    );
  });

  it('test_when_audit_baseline_runs_then_the_decision_path_check_is_wired', () => {
    const auditSrc = readFileSync(
      resolve(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs'),
      'utf8',
    );
    assert.match(auditSrc, /hook-decision-paths\.mjs/, 'audit.mjs must import the check module');
    assert.match(
      auditSrc,
      /hookDecisionPaths/,
      'audit.mjs must reference the check in its CHECKS list',
    );

    // A module that exists but is not in CHECKS emits zero rows and passes
    // vacuously — the exact failure docsite-drift's docblock records.
    const out = runRepoAudit({ label: 'hook-decision-path-drift' });
    assert.match(
      out,
      /hook decision paths:/,
      'a live audit run must emit at least one row from the new check',
    );
  });
});

describe('constitution budget — Article XII invariants survive the Article VIII edit', () => {
  it('test_when_claude_md_edited_then_it_stays_under_cap_and_byte_equal_to_template', () => {
    const live = readFileSync(resolve(REPO_ROOT, 'CLAUDE.md'), 'utf8');
    const mirror = readFileSync(resolve(REPO_ROOT, 'src/CLAUDE.template.md'), 'utf8');

    assert.ok(
      live.length <= 40000,
      `CLAUDE.md must stay at or under 40000 chars; measured ${live.length}`,
    );
    assert.equal(live, mirror, 'CLAUDE.md must stay byte-equal to src/CLAUDE.template.md');
  });
});
