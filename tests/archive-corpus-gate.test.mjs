// release-safety-2026-08-25 T8 — AC-023, AC-024, AC-025.
//
// /archive Step 5.5 already ran the seven-check corpus report and told a reader to
// surface it. A wrong write still reached a commit, because a blocking rule that
// depends on the model reading a JSON and choosing to stop is advice wearing a
// gate's clothes. The gate is an exit code.
//
// `gaps` is reported and never gates, for an arithmetic reason rather than a
// principled one: two gaps pre-exist (.claude/skills/commit/cli.mjs and
// closure-precommit-check.mjs, both unanchored), so gating on them would fail every
// workflow until two unrelated modules are anchored.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const REPORT = '.claude/skills/system-reconcile/reconcile-report.mjs';
const GATE_RENDER = '.claude/skills/system-reconcile/gate-render.mjs';
const ARCHIVE_SKILL = join(REPO_ROOT, '.claude', 'skills', 'archive', 'SKILL.md');

const GATING_SECTIONS = [
  'stale',
  'dangling',
  'duplicateAnchors',
  'orphanShards',
  'unillustrated',
  'missingKind',
];

const CLEAN_REPORT = {
  gaps: [], stale: [], dangling: [], duplicateAnchors: [],
  orphanShards: [], unillustrated: [], missingKind: [],
};

async function gate() {
  const mod = await tryImport(REPORT);
  assert.equal(
    typeof mod?.gatingFailures,
    'function',
    `expected named export \`gatingFailures\` from ${REPORT}`,
  );
  return mod;
}

describe('T8 — a broken corpus fails the phase (AC-023)', () => {
  for (const section of GATING_SECTIONS) {
    it(`test_when_${section}_is_non_empty_then_the_gate_names_it`, async () => {
      const mod = await gate();
      const failures = mod.gatingFailures({ ...CLEAN_REPORT, [section]: ['offender-a'] });

      assert.deepEqual(
        failures.map((entry) => entry.section ?? entry),
        [section],
        `${section} must gate — a corpus write that breaks it currently reaches a commit`,
      );
    });
  }

  it('test_when_two_gating_sections_are_non_empty_then_both_are_named', async () => {
    const mod = await gate();
    const failures = mod.gatingFailures({
      ...CLEAN_REPORT,
      orphanShards: ['a.puml'],
      missingKind: ['el-b'],
    });

    assert.deepEqual(
      failures.map((entry) => entry.section ?? entry).sort(),
      ['missingKind', 'orphanShards'],
      'the gate must report every offending section, not just the first',
    );
  });

  it('test_when_the_gate_names_a_section_then_it_carries_the_offending_members', async () => {
    const mod = await gate();
    const [failure] = mod.gatingFailures({ ...CLEAN_REPORT, orphanShards: ['ghost.puml'] });

    assert.ok(
      JSON.stringify(failure).includes('ghost.puml'),
      'naming the section without its members makes the operator go looking; the report already holds them',
    );
  });
});

describe('T8 — gaps is reported and never gates (AC-024)', () => {
  it('test_when_only_gaps_is_non_empty_then_the_gate_passes', async () => {
    const mod = await gate();
    const failures = mod.gatingFailures({
      ...CLEAN_REPORT,
      gaps: [{ path: '.claude/skills/commit/cli.mjs', reason: 'unanchored' }],
    });

    assert.deepEqual(
      failures,
      [],
      'two gaps pre-exist; gating on them would fail every workflow until two unrelated modules are anchored',
    );
  });

  it('test_when_every_section_is_empty_then_the_gate_passes', async () => {
    const mod = await gate();
    assert.deepEqual(mod.gatingFailures(CLEAN_REPORT), []);
  });

  // runReconcile returns seven empty arrays for THREE different states — clean,
  // flag-off, and crashed — and says so in its own header comment. A gate that
  // reads "all empty" as "healthy" therefore passes a corpus it never managed to
  // read, which is the exact defect class this batch exists to end.
  it('test_when_the_report_could_not_be_produced_then_the_gate_does_not_read_it_as_clean', async () => {
    const mod = await gate();
    const failures = mod.gatingFailures(CLEAN_REPORT, { produced: false });

    assert.notDeepEqual(
      failures,
      [],
      'an unproduced report must not pass the gate — seven empty arrays mean clean, flag-off, or crashed, and only one of those is safe',
    );
  });
});

describe('T8 — the gate is wired into the phase, not just available (AC-025)', () => {
  it('test_when_archive_step_5_5_is_read_then_it_invokes_the_gating_form', () => {
    const text = readFileSync(ARCHIVE_SKILL, 'utf8');
    assert.match(
      text,
      /report\s+--gate/,
      'Step 5.5 must invoke the gating form; the report-only invocation is what let a wrong write reach a commit',
    );
  });

  it('test_when_archive_step_5_5_is_read_then_a_non_zero_exit_fails_the_phase', () => {
    const text = readFileSync(ARCHIVE_SKILL, 'utf8');
    const section = (text.match(/^5\.5\.[\s\S]*?(?=^\d+\.\s)/m) || [''])[0];

    assert.ok(section, 'archive/SKILL.md must still carry a Step 5.5');
    assert.doesNotMatch(
      section,
      /report-only/i,
      'Step 5.5 can no longer describe itself as report-only',
    );
    assert.match(
      section,
      /non-zero|fail(s)? the phase/i,
      'Step 5.5 must state that a non-zero exit fails the phase, rather than leaving the decision to the reader',
    );
  });
});

// Security review 2026-08-25, MEDIUM — the gate's own output was the one renderer
// in this repo that did not sanitize. `memberLabel` returns an element id, an
// element_id or a path read from docs/system/, and the failure line printed them
// raw. terminal-text.mjs's header names the exact impact: an erase-line escape
// "wipes the line printed above it and forges a passing row", so a crafted record
// could show a reader a GATE PASSED line the gate never emitted. Eight modules
// already route through the shared sanitizer; this sink is the ninth.
//
// The escapes below are written as \u sequences on purpose. A raw control byte in
// a source file is invisible in review, which is the same reason this finding
// exists.
const ESC = String.fromCharCode(27);
const ERASE_LINE_AND_UP = `${ESC}[2K${ESC}[A`;
const CONTROL_BYTES = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f]');

describe('T8 — the gate cannot be made to print what it did not decide (security MEDIUM)', () => {
  it('test_when_a_member_carries_control_bytes_then_the_gate_line_is_inert', async () => {
    const cli = await tryImport(GATE_RENDER);

    const forged = { element_id: `real-id${ERASE_LINE_AND_UP}GATE PASSED` };
    const lines = cli.gateVerdict([{ section: 'orphanShards', members: [forged] }]);
    const line = lines[lines.length - 1];

    assert.doesNotMatch(line, CONTROL_BYTES, 'no control byte may reach the terminal');
    assert.match(line, /orphanShards:/, 'the section must still be named');
    assert.match(line, /real-id/, 'the readable part of the id must survive');
  });

  it('test_when_a_member_id_is_absurdly_long_then_the_line_is_bounded', async () => {
    const cli = await tryImport(GATE_RENDER);

    const lines = cli.gateVerdict([{ section: 'stale', members: [{ id: 'x'.repeat(5000) }] }]);
    const line = lines[lines.length - 1];

    assert.ok(line.length < 200, `one member flooded the gate line: ${line.length} chars`);
  });

  it('test_when_the_gate_renderer_is_read_then_it_uses_the_shared_sanitizer', () => {
    const source = readFileSync(join(REPO_ROOT, GATE_RENDER), 'utf8');
    assert.match(
      source,
      /from\s+'[^']*lib\/terminal-text\.mjs'/,
      'the gate must import the one place a repo-controlled string is made safe to print',
    );
  });
});
