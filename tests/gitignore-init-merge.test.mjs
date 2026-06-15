// AC-001 / AC-002 — install/init materializes .gitignore from the baseline data,
// offline and add-only.
//
// RED until src/cli/install.js exports materializeGitignore(target) and the baseline
// data file exists. materializeGitignore reads <target>/.claude/skills/gitignore/
// baseline-ignores.json (already copied by the tree install) and writes/merges
// <target>/.gitignore.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_DATA = join(REPO_ROOT, '.claude/skills/gitignore/baseline-ignores.json');
const install = await import('../src/cli/install.js');

async function tmpRepoWithBaselineData() {
  const dir = await mkdtemp(join(tmpdir(), 'gi-init-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const dest = join(dir, '.claude/skills/gitignore/baseline-ignores.json');
  await mkdir(dirname(dest), { recursive: true });
  try { await cp(BASELINE_DATA, dest); } catch { /* not built yet -> RED */ }
  return dir;
}

describe('AC-001 — init creates a .gitignore covering the baseline set', () => {
  it('test_when_materialize_into_empty_repo_then_creates_gitignore_and_paths_ignored', async () => {
    const dir = await tmpRepoWithBaselineData();
    await install.materializeGitignore(dir);
    const gi = await readFile(join(dir, '.gitignore'), 'utf8');
    assert.ok(gi.length > 0, '.gitignore must be created');

    const data = JSON.parse(await readFile(join(dir, '.claude/skills/gitignore/baseline-ignores.json'), 'utf8'));
    const entries = Array.isArray(data.entries) ? data.entries : [];
    assert.ok(entries.length > 0, 'baseline data must list entries');
    for (const e of entries) {
      const probe = e.pattern.endsWith('/') ? `${e.pattern}probe` : e.pattern.replace(/^!/, '');
      if (probe.startsWith('!') || probe.includes('*')) continue; // negations/globs: skip the literal probe
      const res = execFileSync('git', ['check-ignore', '--no-index', probe], { cwd: dir, encoding: 'utf8' });
      assert.equal(res.trim(), probe, `baseline path must be ignored: ${probe}`);
    }
  });
});

describe('AC-002 — merge into an existing .gitignore is add-only', () => {
  it('test_when_existing_gitignore_then_merge_is_add_only', async () => {
    const dir = await tmpRepoWithBaselineData();
    const original = '# project-specific\nmy-secret-dir/\nbuild-output/\n';
    await writeFile(join(dir, '.gitignore'), original);

    await install.materializeGitignore(dir);

    const merged = await readFile(join(dir, '.gitignore'), 'utf8');
    assert.ok(merged.startsWith(original), 'existing lines must be byte-preserved at the top, no deletions/reorderings');
    assert.match(merged, /my-secret-dir\//, 'custom entry must survive');
    assert.ok(merged.length > original.length, 'missing baseline lines must be appended');
  });
});
