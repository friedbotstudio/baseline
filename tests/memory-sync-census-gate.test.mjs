// /memory-sync gates census literals at write time — AC-005.
//
// Eight census-literal corrections landed in one two-commit session, across four
// sittings, while three memory entries describing the pattern were being
// authored — and two of the eight were caused by writing those entries. The cost
// is paid by whoever next runs the suite, which is the wrong person: the flush
// that moves a literal is the call that knows it moved.
//
// The engineer chose the write-time gate over deriving the path-leg census at
// triage. This suite pins that choice: re-measure in the same commit, or refuse
// and name the site. Writing canonical files and leaving the literal stale is the
// one outcome that must be impossible.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUT = path.join(REPO_ROOT, '.claude/skills/memory-sync/census-gate.mjs');

async function loadGate() {
  try {
    return await import(`${SUT}?t=${Date.now()}-${Math.random()}`);
  } catch (err) {
    throw new Error(
      `.claude/skills/memory-sync/census-gate.mjs must exist and export ` +
      `measureCensusMovement — ${err.message}`,
    );
  }
}

// A repo just large enough to carry one census literal and the store it counts.
function makeProject({ literalValue = 2, entries = ['alpha', 'beta'] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'census-gate-'));
  const memDir = path.join(root, '.claude/memory/landmarks');
  const testsDir = path.join(root, 'tests');
  mkdirSync(memDir, { recursive: true });
  mkdirSync(testsDir, { recursive: true });

  for (const name of entries) {
    writeFileSync(path.join(memDir, `${name}.md`),
      `---\nkey: ${name}\ncategory: landmarks\nscope: [scout]\n---\n\nbody\n`);
  }
  writeFileSync(path.join(testsDir, 'census.test.mjs'),
    `const LANDMARK_SCOPE_BASELINE = ${literalValue};\nexport { LANDMARK_SCOPE_BASELINE };\n`);

  return { root, memDir, testsDir };
}

const SITE = {
  file: 'tests/census.test.mjs',
  symbol: 'LANDMARK_SCOPE_BASELINE',
  measure: 'landmarks-with-scope-scout',
};

describe('memory-sync census gate — a write re-measures what it moves (AC-005)', () => {
  it('test_when_flush_moves_a_census_literal_then_gate_remeasures_it', async () => {
    const gate = await loadGate();
    const { root } = makeProject({ literalValue: 2, entries: ['alpha', 'beta'] });
    try {
      const verdict = gate.measureCensusMovement({
        rootDir: root,
        sites: [SITE],
        pendingEntries: [{ key: 'gamma', category: 'landmarks', scope: ['scout'] }],
      });

      assert.equal(verdict.refused, false, 'a re-measurable literal must not refuse the flush');
      assert.equal(verdict.remeasured, true);
      assert.equal(verdict.moved.length, 1,
        'the gate must notice that adding a scope:[scout] landmark moves the count');
      assert.deepEqual(
        { file: verdict.moved[0].file, from: verdict.moved[0].from, to: verdict.moved[0].to },
        { file: 'tests/census.test.mjs', from: 2, to: 3 },
        'the moved row must name the site and both values, so the commit message can cite them',
      );
      assert.match(readFileSync(path.join(root, 'tests/census.test.mjs'), 'utf8'),
        /LANDMARK_SCOPE_BASELINE = 3/,
        're-measuring means writing the new value in the same call, not reporting it');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_literal_cannot_be_remeasured_then_flush_is_refused', async () => {
    const gate = await loadGate();
    const { root, testsDir } = makeProject({ literalValue: 2 });
    const site = path.join(testsDir, 'census.test.mjs');
    const before = readFileSync(site, 'utf8');
    chmodSync(site, 0o444);
    try {
      const verdict = gate.measureCensusMovement({
        rootDir: root,
        sites: [SITE],
        pendingEntries: [{ key: 'gamma', category: 'landmarks', scope: ['scout'] }],
      });

      assert.equal(verdict.refused, true,
        'an unwritable literal site must refuse the flush — writing the store and ' +
        'leaving the assertion stale is the exact outcome this gate exists to prevent');
      assert.ok(verdict.moved.some((m) => m.file === 'tests/census.test.mjs'),
        'the refusal must name the site the curator has to settle, not just say no');
      assert.equal(readFileSync(site, 'utf8'), before,
        'a refused flush leaves the literal untouched');
    } finally {
      chmodSync(site, 0o644);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_flush_moves_nothing_then_gate_is_silent', async () => {
    const gate = await loadGate();
    const { root } = makeProject({ literalValue: 2 });
    try {
      const verdict = gate.measureCensusMovement({
        rootDir: root,
        sites: [SITE],
        pendingEntries: [{ key: 'gamma', category: 'decisions', scope: [] }],
      });

      assert.deepEqual(verdict.moved, [],
        'a decisions entry with no scout scope moves no landmark census');
      assert.equal(verdict.refused, false, 'the gate must not tax the common case');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_no_sites_declared_then_gate_returns_a_clean_verdict', async () => {
    const gate = await loadGate();
    const { root } = makeProject();
    try {
      const verdict = gate.measureCensusMovement({ rootDir: root, sites: [], pendingEntries: [] });

      assert.deepEqual(verdict, { moved: [], remeasured: false, refused: false },
        'a project declaring no census sites gets a clean verdict rather than an error — ' +
        'the gate ships to consumers that have no such literals at all');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_a_declared_site_is_missing_then_flush_is_refused', async () => {
    const gate = await loadGate();
    const { root } = makeProject();
    try {
      const verdict = gate.measureCensusMovement({
        rootDir: root,
        sites: [{ file: 'tests/gone.test.mjs', symbol: 'X', measure: 'landmarks-with-scope-scout' }],
        pendingEntries: [{ key: 'gamma', category: 'landmarks', scope: ['scout'] }],
      });

      assert.equal(verdict.refused, true,
        'a declared site that has vanished is a broken contract, not a silent skip — ' +
        'skipping it is how a census stops being gated without anyone noticing');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
