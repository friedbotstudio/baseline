// Tests for pre-implementation-gate.mjs — the relocated machine spec-review
// BLOCKED checks (spec: docs/specs/gate-collapse.md, AC-007, D-6).
//
// With the human /approve-spec gate gone, the shippability + checker-fanout
// BLOCKED cross-checks (formerly at token-write inside spec_approval_guard) move
// to the spec-shippability-review -> implementation boundary. When any verdict is
// BLOCKED, the harness must yield (spec defect); a blocked spec never reaches code.
//
// FAILS until .claude/skills/harness/pre-implementation-gate.mjs exists exporting
// checkImplementationReady({ slug, rootDir }).

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { checkImplementationReady } = await import(path.join(REPO_ROOT, '.claude/skills/harness/pre-implementation-gate.mjs'));

const SANDBOXES = [];
function sandbox({ shippability, fanout } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'preimpl-'));
  mkdirSync(path.join(root, '.claude/state/spec-shippability'), { recursive: true });
  mkdirSync(path.join(root, '.claude/state/checker-fanout'), { recursive: true });
  if (shippability) writeFileSync(path.join(root, '.claude/state/spec-shippability/demo.json'), JSON.stringify(shippability));
  if (fanout) writeFileSync(path.join(root, '.claude/state/checker-fanout/demo.json'), JSON.stringify(fanout));
  SANDBOXES.push(root);
  return root;
}
after(() => { for (const s of SANDBOXES) { try { rmSync(s, { recursive: true, force: true }); } catch {} } });

describe('pre-implementation-gate — BLOCKED spec-review stops implementation (AC-007)', () => {
  it('test_when_both_verdicts_clean_then_ready', () => {
    const root = sandbox({ shippability: { verdict: 'CLEAN' }, fanout: { verdict: 'CLEAN' } });
    const r = checkImplementationReady({ slug: 'demo', rootDir: root });
    assert.equal(r.ready, true);
  });

  it('test_when_verdicts_absent_then_ready_failsafe', () => {
    const root = sandbox({});
    const r = checkImplementationReady({ slug: 'demo', rootDir: root });
    assert.equal(r.ready, true, 'absent verdicts fall through to ready (no verdict to block on)');
  });

  it('test_when_shippability_blocked_then_not_ready', () => {
    const root = sandbox({ shippability: { verdict: 'BLOCKED', findings: [{ severity: 'BLOCKER', message: 'dev-tree ref' }] }, fanout: { verdict: 'CLEAN' } });
    const r = checkImplementationReady({ slug: 'demo', rootDir: root });
    assert.equal(r.ready, false);
    assert.ok(r.blockers.length >= 1, 'must surface the blocker(s)');
  });

  it('test_when_checker_fanout_blocked_then_not_ready', () => {
    const root = sandbox({ shippability: { verdict: 'CLEAN' }, fanout: { verdict: 'BLOCKED', findings: [{ severity: 'BLOCKER', message: 'AC untraced' }] } });
    const r = checkImplementationReady({ slug: 'demo', rootDir: root });
    assert.equal(r.ready, false);
  });

  it('test_when_harness_sop_read_then_it_wires_the_checkpoint_before_implementation', () => {
    // Regression guard for the HIGH security finding: the helper must actually be
    // invoked by the harness SOP before implementation, not left as dead code.
    const sop = readFileSync(path.join(REPO_ROOT, '.claude/skills/harness/SKILL.md'), 'utf8');
    assert.match(sop, /checkImplementationReady/, 'harness SOP must invoke the pre-implementation checkpoint');
    assert.match(sop, /before invoking `implementation`|before .*implementation/i, 'checkpoint must fire before implementation');
  });

  it('test_when_slug_has_traversal_then_throws', () => {
    const root = sandbox({});
    assert.throws(() => checkImplementationReady({ slug: '../../etc/x', rootDir: root }), /slug/i,
      'a traversal slug must be REJECTED before any path is constructed (CWE-22)');
  });

  it('test_when_malformed_verdict_then_ready_failsafe', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preimpl-'));
    mkdirSync(path.join(root, '.claude/state/checker-fanout'), { recursive: true });
    writeFileSync(path.join(root, '.claude/state/checker-fanout/demo.json'), '{ not json');
    SANDBOXES.push(root);
    const r = checkImplementationReady({ slug: 'demo', rootDir: root });
    assert.equal(r.ready, true, 'unparseable verdict must not hard-block (fail-safe, matches guard behavior)');
  });
});
