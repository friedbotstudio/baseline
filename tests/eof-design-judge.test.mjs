import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// Step 4 — the design-judge. runDesignJudge({row, deps}) captures the render via
// Playwright, scores it mechanically against row.qualityCriteria (the teeth), and
// below threshold writes a FAIL to last_test_result. The vision read is advisory (D1).
//
// MOCK: the Playwright browser cannot launch in the test env — deps.navigate /
// deps.snapshot / deps.vision are injected fakes. This is the sole sanctioned mock
// (a third-party that can't run locally); no internal module is mocked.

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const JUDGE = pathToFileURL(join(ROOT, '.claude/skills/harness/design-judge.mjs')).href;

const ROW = { slug: 's', referenceTarget: 'https://ref.example/mock.png', qualityCriteria: 'contrast >= AA; element hero present' };

// MOCK: fake Playwright capture — a passing snapshot (hero present, good contrast).
const passingDeps = (root) => ({
  rootDir: root,
  navigate: async () => ({}),
  snapshot: async () => ({ tree: 'hero button link', boxes: [{ ref: 'hero', box: [0, 0, 100, 40] }], contrast: 7.1 }),
  vision: async () => ({ fidelity: 0.9, note: 'looks fine' }),
});
// MOCK: fake Playwright capture — a failing snapshot (hero absent, low contrast).
const failingDeps = (root) => ({
  rootDir: root,
  navigate: async () => ({}),
  snapshot: async () => ({ tree: 'plain text', boxes: [], contrast: 2.0 }),
  vision: async () => ({ fidelity: 0.9, note: 'vision says fine but mechanical fails' }),
});
// MOCK: no browser — navigate throws.
const noBrowserDeps = (root) => ({
  rootDir: root,
  navigate: async () => { throw new Error('browserType.launch: Executable doesn\'t exist'); },
  snapshot: async () => { throw new Error('no page'); },
  vision: async () => ({}),
});

async function stateRoot() {
  const root = await mkdtemp(join(tmpdir(), 'eof-judge-'));
  await mkdir(join(root, '.claude/state'), { recursive: true });
  return root;
}
const lastResult = (root) => join(root, '.claude/state/last_test_result');

describe('design-judge — mechanical teeth (AC-006)', () => {
  it('test_when_render_below_quality_threshold_then_verify_FAIL', async () => {
    const m = await import(JUDGE);
    const root = await stateRoot();
    try {
      const out = await m.runDesignJudge({ row: ROW, deps: failingDeps(root) });
      assert.equal(out.status, 'FAIL', 'a below-threshold render fails');
      assert.ok(existsSync(lastResult(root)), 'a FAIL stamps last_test_result');
      const lines = (await readFile(lastResult(root), 'utf8')).split('\n');
      assert.equal(lines[0], 'FAIL', 'line 1 is FAIL (4-line format)');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('test_when_render_above_threshold_then_pass', async () => {
    const m = await import(JUDGE);
    const root = await stateRoot();
    try {
      const out = await m.runDesignJudge({ row: ROW, deps: passingDeps(root) });
      assert.equal(out.status, 'PASS');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('test_when_vision_read_present_then_advisory_only', async () => {
    const m = await import(JUDGE);
    const root = await stateRoot();
    try {
      // vision fidelity is present but low; mechanical passes -> overall PASS (vision never gates, D1)
      const deps = { ...passingDeps(root), vision: async () => ({ fidelity: 0.1, note: 'ugly' }) };
      const out = await m.runDesignJudge({ row: ROW, deps });
      assert.equal(out.status, 'PASS', 'vision fidelity is advisory — it never flips a mechanical PASS to FAIL');
      assert.ok('vision' in out || 'advisory' in out, 'the vision read is surfaced, not gating');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('design-judge — no browser SKIPs (AC-007)', () => {
  it('test_when_no_browser_then_SKIP_no_false_fail', async () => {
    const m = await import(JUDGE);
    const root = await stateRoot();
    try {
      const out = await m.runDesignJudge({ row: ROW, deps: noBrowserDeps(root) });
      assert.equal(out.status, 'SKIP', 'no browser -> SKIP');
      assert.ok(out.reason && /browser/i.test(out.reason), 'SKIP records a reason');
      assert.equal(existsSync(lastResult(root)), false, 'SKIP writes NO last_test_result FAIL (no false FAIL)');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
