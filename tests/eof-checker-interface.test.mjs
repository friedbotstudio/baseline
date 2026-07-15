import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// Enforcement oracle framework — Step 1: the phase-tagged checker interface.
// checker-fanout.mjs gains a `phase` tag per registry entry, a `ctx` carrying
// {diffContent, changedFiles}, and a code-review invocation that writes a
// PARALLEL projection at .claude/state/checker-fanout-code/<slug>.json —
// never the gate-A projection at .claude/state/checker-fanout/<slug>.json.

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const FANOUT_URL = pathToFileURL(join(ROOT, '.claude/skills/harness/checker-fanout.mjs')).href;

async function makeProject() {
  const root = await mkdtemp(join(tmpdir(), 'eof-iface-'));
  const live = JSON.parse(await readFile(join(ROOT, '.claude/project.json'), 'utf8'));
  await mkdir(join(root, '.claude/state'), { recursive: true });
  await writeFile(join(root, '.claude/project.json'), JSON.stringify(live, null, 2) + '\n');
  await mkdir(join(root, 'docs/specs'), { recursive: true });
  await mkdir(join(root, 'docs/intake'), { recursive: true });
  return root;
}

const MINIMAL_SPEC = `# Spec\n\n## Acceptance criteria\n\n| ID | Criterion | Kind | Upstream | Sequence |\n|---|---|---|---|---|\n| AC-001 | x | behavior | intake 1 | §Behavior #1 |\n`;

describe('checker-fanout — phase-tagged interface (AC-001)', () => {
  it('test_when_checker_registered_then_uniform_run_ctx_contract', async () => {
    const m = await import(FANOUT_URL);
    const registry = m.DEFAULT_CHECKER_REGISTRY;
    assert.ok(registry && typeof registry === 'object', 'registry must exist');
    for (const [name, entry] of Object.entries(registry)) {
      const run = typeof entry === 'function' ? entry : entry.run;
      assert.equal(typeof run, 'function', `checker ${name} must expose a run(ctx) function`);
      const phase = typeof entry === 'function' ? entry.phase : entry.phase;
      assert.ok(phase === 'spec-review' || phase === 'code-review', `checker ${name} must carry a phase tag`);
    }
  });
});

describe('checker-fanout — parallel code-review projection (AC-002)', () => {
  it('test_when_code_review_fanout_runs_then_writes_parallel_projection', async () => {
    const m = await import(FANOUT_URL);
    const root = await makeProject();
    try {
      const slug = 'iface-code';
      await writeFile(join(root, `docs/specs/${slug}.md`), MINIMAL_SPEC);
      await m.runCheckerFanout({ slug, rootDir: root, enabled: true, phase: 'code-review', ctx: { diffContent: '', changedFiles: [] } });
      assert.ok(existsSync(join(root, '.claude/state/checker-fanout-code', `${slug}.json`)), 'code-review writes the parallel projection');
      assert.equal(existsSync(join(root, '.claude/state/checker-fanout', `${slug}.json`)), false, 'code-review must NOT write the gate-A projection');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('checker-fanout — gate-A projection unchanged (AC-008)', () => {
  it('test_when_spec_review_fanout_runs_then_gateA_projection_shape_unchanged', async () => {
    const m = await import(FANOUT_URL);
    const root = await makeProject();
    try {
      const slug = 'iface-spec';
      await writeFile(join(root, `docs/specs/${slug}.md`), MINIMAL_SPEC);
      const verdict = await m.runCheckerFanout({ slug, rootDir: root, enabled: true, phase: 'spec-review' });
      assert.ok(existsSync(join(root, '.claude/state/checker-fanout', `${slug}.json`)), 'spec-review keeps the gate-A projection path');
      const proj = JSON.parse(await readFile(join(root, '.claude/state/checker-fanout', `${slug}.json`), 'utf8'));
      for (const k of ['checkers', 'findings', 'verdict']) assert.ok(k in proj, `projection must carry ${k}`);
      assert.ok(proj.verdict === 'CLEAN' || proj.verdict === 'BLOCKED', 'verdict is CLEAN|BLOCKED');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
