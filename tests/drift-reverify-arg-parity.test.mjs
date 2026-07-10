// drift-reverify-guard arg parity — T2 of harden-power-track-debt.
//
// The guard parses its slug positionally, but tdd/SKILL.md + harness/SKILL.md
// document `--slug <slug>`; following the docs writes a shared `--slug.driftfp`.
// This asserts both forms resolve the same fingerprint path and that no
// `--slug.driftfp` is ever created.
//
// RED until /implement accepts `--slug` (currently the flag is swallowed as the slug).

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

let guard;
try {
  guard = await import(path.join(REPO_ROOT, '.claude/skills/tdd/drift-reverify-guard.mjs'));
} catch (err) {
  throw new Error(`Cannot import drift-reverify-guard.mjs. Original: ${err.message}`);
}

const tempDirs = [];
after(async () => {
  await Promise.all(tempDirs.map((d) => rm(d, { recursive: true, force: true })));
});

async function freshStateDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'drift-arg-'));
  tempDirs.push(dir);
  return dir;
}

describe('drift-reverify-guard accepts both invocation forms', () => {
  // AC-004
  it('test_when_capture_positional_and_flag_forms_then_write_identical_path', async () => {
    const slug = 'my-slug';
    const dirA = await freshStateDir();
    guard.main(['capture', slug], { stateDir: dirA, treeState: () => ({ diff: "", untracked: [] }) });
    const dirB = await freshStateDir();
    guard.main(['capture', '--slug', slug], { stateDir: dirB, treeState: () => ({ diff: "", untracked: [] }) });

    const filesA = await readdir(dirA);
    const filesB = await readdir(dirB);
    assert.deepEqual(filesA, filesB, 'both forms write the same file name');
    assert.deepEqual(filesA, ['my-slug.driftfp'], 'the fingerprint is <slug>.driftfp');
  });

  // AC-005
  it('test_when_flag_form_used_then_no_dashdash_slug_driftfp_created', async () => {
    const dir = await freshStateDir();
    guard.main(['capture', '--slug', 'my-slug'], { stateDir: dir, treeState: () => ({ diff: "", untracked: [] }) });
    const files = await readdir(dir);
    assert.ok(!files.includes('--slug.driftfp'), `no --slug.driftfp; saw: ${files.join(', ')}`);
    assert.ok(files.includes('my-slug.driftfp'), 'the real <slug>.driftfp is present');
  });

  // AC-004 — positional back-compat unchanged
  it('test_when_positional_form_used_then_back_compat_preserved', async () => {
    const dir = await freshStateDir();
    guard.main(['capture', 'legacy-slug'], { stateDir: dir, treeState: () => ({ diff: "", untracked: [] }) });
    const files = await readdir(dir);
    assert.deepEqual(files, ['legacy-slug.driftfp'], 'positional still writes <slug>.driftfp');
  });
});
