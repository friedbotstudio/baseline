// C5 — AC-conformance checker adapter (non-ui-oracle-c5).
// RED until .claude/skills/harness/checkers/ac-conformance.mjs exists.
// Covers: AC-003 (flag off / no spec -> no findings),
// AC-004 (an AC id absent from the diff -> a finding, BLOCKER since ac-conformance
// is mandatory; all ACs present -> none). Reuses drift_check's AC extraction.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOD = join(REPO_ROOT, '.claude/skills/harness/checkers/ac-conformance.mjs');

function tmpRootWithFlag(enabled) {
  const root = mkdtempSync(join(tmpdir(), 'acc-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude', 'project.json'),
    JSON.stringify({ velocity: { ac_conformance: { enabled } } }));
  return root;
}

describe('C5 ac-conformance findingsFromAcs', () => {
  it('test_when_ac_absent_from_diff_then_finding', async () => {
    const { findingsFromAcs } = await import(MOD);
    const diff = '+ // Covers: AC-001 length guard\n+ some code';
    const findings = findingsFromAcs(['AC-001', 'AC-002'], diff, { floor: 1, mandatory: true });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'BLOCKER');
    assert.equal(findings[0].checker, 'ac-conformance');
    assert.match(findings[0].message, /AC-002/);
  });

  it('test_when_all_acs_present_in_diff_then_no_finding', async () => {
    const { findingsFromAcs } = await import(MOD);
    const diff = '+ AC-001 here\n+ AC-002 there';
    assert.deepEqual(findingsFromAcs(['AC-001', 'AC-002'], diff, { floor: 1, mandatory: true }), []);
  });
});

describe('C5 ac-conformance adapter run(ctx)', () => {
  it('test_when_ac_flag_off_or_no_spec_then_no_findings', async () => {
    const { acConformanceAdapter } = await import(MOD);
    assert.equal(acConformanceAdapter.phase, 'code-review');
    // flag off
    const off = await acConformanceAdapter.run({
      rootDir: tmpRootWithFlag(false), slug: 'nope', diffContent: 'x',
    });
    assert.deepEqual(off.findings, []);
    // flag on but no spec on disk for this slug
    const noSpec = await acConformanceAdapter.run({
      rootDir: tmpRootWithFlag(true), slug: 'no-such-spec-slug', diffContent: 'x',
    });
    assert.deepEqual(noSpec.findings, []);
  });
});
