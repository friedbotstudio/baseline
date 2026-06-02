// whatsnew generator — fragment-writer.mjs (AC-001).
//
// The generator serializes a set of change entries to a structured JSON
// "what's new" fragment under .claude/state/whatsnew/<slug>.json. The fragment
// is the gitignored handoff buffer a per-project routing workflow consumes.
//
// RED until .claude/skills/whatsnew/fragment-writer.mjs exists and exports
// writeFragment({ repoRoot, slug, entries, now }).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loadWriter = () => import(join(REPO_ROOT, '.claude/skills/whatsnew/fragment-writer.mjs'));

const SAMPLE = [
  { category: 'Added', title: 'whatsnew generator', body: 'Emits a structured fragment.', highlight: true },
  { category: 'Changed', title: 'CHANGELOG.md is machine-only', body: 'semantic-release owns it.' },
];

async function freshRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'whatsnew-frag-'));
  return dir;
}

describe('whatsnew fragment-writer', () => {
  it('test_when_entries_given_then_fragment_schema_valid', async () => {
    const { writeFragment } = await loadWriter();
    const repoRoot = await freshRepo();
    const { path } = await writeFragment({ repoRoot, slug: 'demo', entries: SAMPLE, now: '2026-06-02T00:00:00Z' });

    assert.equal(path, join(repoRoot, '.claude/state/whatsnew/demo.json'));
    const frag = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(frag.slug, 'demo');
    assert.equal(typeof frag.generated_at, 'string');
    assert.ok(frag.generated_at.length > 0);
    assert.equal(frag.entries.length, 2);
    for (const e of frag.entries) {
      assert.equal(typeof e.category, 'string');
      assert.equal(typeof e.title, 'string');
      assert.equal(typeof e.body, 'string');
    }
    // No version field anywhere — version is read at publish time by the routing target.
    assert.equal('version' in frag, false);
    for (const e of frag.entries) assert.equal('version' in e, false);
  });

  it('test_when_generator_runs_then_no_changelog_md_write', async () => {
    const { writeFragment } = await loadWriter();
    const repoRoot = await freshRepo();
    const changelogPath = join(repoRoot, 'CHANGELOG.md');
    const before = '# Changelog\n\n## [0.1.0]\n';
    await writeFile(changelogPath, before);

    await writeFragment({ repoRoot, slug: 'demo', entries: SAMPLE, now: '2026-06-02T00:00:00Z' });

    const after = await readFile(changelogPath, 'utf8');
    assert.equal(after, before);
  });

  it('test_when_entries_empty_or_missing_title_then_validation_error', async () => {
    const { writeFragment } = await loadWriter();
    const repoRoot = await freshRepo();
    await assert.rejects(() => writeFragment({ repoRoot, slug: 'demo', entries: [] }));
    await assert.rejects(() =>
      writeFragment({ repoRoot, slug: 'demo', entries: [{ category: 'Added', body: 'no title' }] }),
    );
  });

  it('test_when_slug_has_path_traversal_then_rejected', async () => {
    const { writeFragment } = await loadWriter();
    const repoRoot = await freshRepo();
    await assert.rejects(
      () => writeFragment({ repoRoot, slug: '../../escape', entries: SAMPLE }),
      /slug/,
    );
  });
});
