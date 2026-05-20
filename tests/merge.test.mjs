import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashFile, saveManifest } from '../src/cli/manifest.js';

const merge = await import('../src/cli/merge.js');

async function makeTemplateFixture(content = '# baseline v2\n') {
  const tplDir = await mkdtemp(join(tmpdir(), 'merge-tpl-'));
  await writeFile(join(tplDir, 'CLAUDE.md'), content);
  await writeFile(join(tplDir, '.mcp.json'), JSON.stringify({
    mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
  }, null, 2) + '\n');
  return tplDir;
}

async function manifestOf(dir, files) {
  const out = { manifest_version: 1, generated_at: new Date().toISOString(), files: {} };
  for (const rel of files) {
    out.files[rel] = await hashFile(join(dir, rel));
  }
  return out;
}

describe('threeWayMerge', () => {
  it('first-time merge with no old manifest reports SKIP_CUSTOMIZED for existing files and ADD for new', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'merge-target-'));

    await writeFile(join(target, 'CLAUDE.md'), '# user version\n');

    const newM = await manifestOf(tpl, ['CLAUDE.md', '.mcp.json']);
    const report = await merge.threeWayMerge(tpl, target, null, newM);

    const claudeAction = report.actions.find((a) => a.path === 'CLAUDE.md');
    assert.ok(claudeAction, 'expected an action for CLAUDE.md');
    assert.equal(claudeAction.kind, 'SKIP_CUSTOMIZED');

    const mcpAction = report.actions.find((a) => a.path === '.mcp.json');
    assert.ok(mcpAction, 'expected an action for .mcp.json');
    assert.ok(['ADD', 'SPECIAL_MERGE'].includes(mcpAction.kind));

    assert.ok(report.exitCode === 3 || report.exitCode === 0);
  });

  it('overwrites a file whose target hash matches the old manifest hash', async () => {
    const tpl = await makeTemplateFixture('# baseline v2\n');
    const target = await mkdtemp(join(tmpdir(), 'merge-target-'));

    await writeFile(join(target, 'CLAUDE.md'), '# baseline v1\n');

    const oldM = await manifestOf(target, ['CLAUDE.md']);
    const newM = await manifestOf(tpl, ['CLAUDE.md']);

    const report = await merge.threeWayMerge(tpl, target, oldM, newM);

    const after = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    assert.equal(after, '# baseline v2\n');

    const action = report.actions.find((a) => a.path === 'CLAUDE.md');
    assert.equal(action.kind, 'OVERWRITE');
  });

  it('skips a customized file (target hash differs from old)', async () => {
    const tpl = await makeTemplateFixture('# baseline v2\n');
    const target = await mkdtemp(join(tmpdir(), 'merge-target-'));

    const oldFakeContent = '# baseline v1\n';
    await writeFile(join(target, 'CLAUDE.md'), '# user customized!\n');

    const oldFakeDir = await mkdtemp(join(tmpdir(), 'old-snap-'));
    await writeFile(join(oldFakeDir, 'CLAUDE.md'), oldFakeContent);
    const oldM = await manifestOf(oldFakeDir, ['CLAUDE.md']);
    const newM = await manifestOf(tpl, ['CLAUDE.md']);

    const report = await merge.threeWayMerge(tpl, target, oldM, newM);

    const after = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    assert.equal(after, '# user customized!\n', 'customized content preserved');

    const action = report.actions.find((a) => a.path === 'CLAUDE.md');
    assert.equal(action.kind, 'SKIP_CUSTOMIZED');
    assert.equal(report.exitCode, 3);
  });

  it('prunes a file removed upstream whose target still matches the old manifest', async () => {
    // File was part of the baseline at last install, has since been removed
    // upstream, and the user never touched it. Under default `--merge`
    // semantics (no flag), the merge SHALL delete the stale file.
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'merge-target-'));

    const stalePath = join(target, '.claude/hooks/old_hook.sh');
    await mkdir(join(target, '.claude/hooks'), { recursive: true });
    await writeFile(stalePath, '# baseline v1 hook\n');

    // Old manifest knew about the hook; new template does not.
    const oldM = {
      manifest_version: 1,
      generated_at: '',
      files: { '.claude/hooks/old_hook.sh': await hashFile(stalePath) },
    };
    const newM = await manifestOf(tpl, ['CLAUDE.md']);

    const report = await merge.threeWayMerge(tpl, target, oldM, newM);

    const action = report.actions.find((a) => a.path === '.claude/hooks/old_hook.sh');
    assert.ok(action, 'expected an action for the removed file');
    assert.equal(action.kind, 'PRUNE', 'untouched stale file must be pruned');

    await assert.rejects(access(stalePath), 'pruned file must be deleted from disk');
  });

  it('preserves a customized stale file even when removed upstream (PRUNE_SKIPPED_CUSTOMIZED)', async () => {
    // File was part of the baseline at last install, has since been removed
    // upstream, but the user customized it. The merge SHALL preserve the
    // file (deleting user work would be hostile) and signal drift via exit 3.
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'merge-target-'));

    const stalePath = join(target, '.claude/hooks/old_hook.sh');
    await mkdir(join(target, '.claude/hooks'), { recursive: true });
    await writeFile(stalePath, '# user customized this hook\n');

    // Old manifest recorded a DIFFERENT hash (the original baseline content).
    const oldFakeDir = await mkdtemp(join(tmpdir(), 'old-snap-'));
    await mkdir(join(oldFakeDir, '.claude/hooks'), { recursive: true });
    await writeFile(join(oldFakeDir, '.claude/hooks/old_hook.sh'), '# baseline v1 hook\n');
    const oldM = {
      manifest_version: 1,
      generated_at: '',
      files: { '.claude/hooks/old_hook.sh': await hashFile(join(oldFakeDir, '.claude/hooks/old_hook.sh')) },
    };
    const newM = await manifestOf(tpl, ['CLAUDE.md']);

    const report = await merge.threeWayMerge(tpl, target, oldM, newM);

    const action = report.actions.find((a) => a.path === '.claude/hooks/old_hook.sh');
    assert.ok(action, 'expected an action for the removed file');
    assert.equal(action.kind, 'PRUNE_SKIPPED_CUSTOMIZED', 'customized stale file must NOT be pruned');

    await access(stalePath); // throws if missing — we want it to exist
    const content = await readFile(stalePath, 'utf8');
    assert.equal(content, '# user customized this hook\n', 'customized content preserved');

    assert.equal(report.exitCode, 3, 'customized stale file is drift; exit code must be 3');
  });

  it('test_when_threeWayMerge_customized_file_tier_BINARY_PROMPT_then_SKIP_CUSTOMIZED_action', async () => {
    const tpl = await makeTemplateFixture('# baseline v2\n');
    const target = await mkdtemp(join(tmpdir(), 'merge-tier-bp-'));
    await writeFile(join(target, 'CLAUDE.md'), '# user customized\n');

    const oldFakeDir = await mkdtemp(join(tmpdir(), 'old-snap-bp-'));
    await writeFile(join(oldFakeDir, 'CLAUDE.md'), '# baseline v1\n');
    const oldM = {
      manifest_version: 2,
      baseline_version: '0.4.0',
      generated_at: '',
      files: { 'CLAUDE.md': await hashFile(join(oldFakeDir, 'CLAUDE.md')) },
    };
    const newM = {
      manifest_version: 3,
      generated_at: '',
      files: { 'CLAUDE.md': { sha256: await hashFile(join(tpl, 'CLAUDE.md')), tier: 'BINARY_PROMPT' } },
    };

    const report = await merge.threeWayMerge(tpl, target, oldM, newM);

    const action = report.actions.find((a) => a.path === 'CLAUDE.md');
    assert.equal(action.kind, 'SKIP_CUSTOMIZED',
      'tier BINARY_PROMPT customized file must emit SKIP_CUSTOMIZED (regression with today\'s behavior)');
  });

  it('test_when_threeWayMerge_customized_file_tier_MECHANICAL_then_dispatches_through_tier_module', async () => {
    const tpl = await makeTemplateFixture('# baseline v2 mech\n');
    const target = await mkdtemp(join(tmpdir(), 'merge-tier-mech-'));
    await writeFile(join(target, 'CLAUDE.md'), '# user customized mech\n');
    await mkdir(join(target, '.claude/.baseline-prior'), { recursive: true });
    await writeFile(join(target, '.claude/.baseline-prior/CLAUDE.md'), '# baseline v1\n');

    const oldFakeDir = await mkdtemp(join(tmpdir(), 'old-snap-mech-'));
    await writeFile(join(oldFakeDir, 'CLAUDE.md'), '# baseline v1\n');
    const oldM = {
      manifest_version: 2,
      baseline_version: '0.4.0',
      generated_at: '',
      files: { 'CLAUDE.md': await hashFile(join(oldFakeDir, 'CLAUDE.md')) },
    };
    const newM = {
      manifest_version: 3,
      generated_at: '',
      files: { 'CLAUDE.md': { sha256: await hashFile(join(tpl, 'CLAUDE.md')), tier: 'MECHANICAL' } },
    };

    const report = await merge.threeWayMerge(tpl, target, oldM, newM);

    const action = report.actions.find((a) => a.path === 'CLAUDE.md');
    assert.ok(['MECHANICAL_MERGE_CLEAN', 'MECHANICAL_MERGE_CONFLICTED'].includes(action.kind),
      `tier MECHANICAL customized file must dispatch through upgrade-tiers and emit a MECHANICAL_* action; got ${action.kind}`);
  });

  it('test_when_threeWayMerge_customized_file_tier_SEMANTIC_then_dispatches_through_tier_module_and_exit_5', async () => {
    const tpl = await makeTemplateFixture('# baseline v2 sem\n');
    const target = await mkdtemp(join(tmpdir(), 'merge-tier-sem-'));
    await writeFile(join(target, 'CLAUDE.md'), '# user customized sem\n');
    await mkdir(join(target, '.claude/.baseline-prior'), { recursive: true });
    await writeFile(join(target, '.claude/.baseline-prior/CLAUDE.md'), '# baseline v1\n');

    const oldFakeDir = await mkdtemp(join(tmpdir(), 'old-snap-sem-'));
    await writeFile(join(oldFakeDir, 'CLAUDE.md'), '# baseline v1\n');
    const oldM = {
      manifest_version: 2,
      baseline_version: '0.4.0',
      generated_at: '',
      files: { 'CLAUDE.md': await hashFile(join(oldFakeDir, 'CLAUDE.md')) },
    };
    const newM = {
      manifest_version: 3,
      generated_at: '',
      files: { 'CLAUDE.md': { sha256: await hashFile(join(tpl, 'CLAUDE.md')), tier: 'SEMANTIC' } },
    };

    const report = await merge.threeWayMerge(tpl, target, oldM, newM);

    const action = report.actions.find((a) => a.path === 'CLAUDE.md');
    assert.equal(action.kind, 'SEMANTIC_MERGE_STAGED',
      'tier SEMANTIC customized file must emit SEMANTIC_MERGE_STAGED');
    assert.equal(report.exitCode, 5,
      'any SEMANTIC_MERGE_STAGED in the report must raise overall exit code to 5');
  });

  it('test_when_threeWayMerge_mechanical_conflicted_then_exit_4', async () => {
    const tpl = await makeTemplateFixture('# baseline\nLINE A INCOMING\nLINE B\n');
    const target = await mkdtemp(join(tmpdir(), 'merge-tier-mech-conf-'));
    await writeFile(join(target, 'CLAUDE.md'), '# baseline\nLINE A LOCAL EDIT\nLINE B\n');
    await mkdir(join(target, '.claude/.baseline-prior'), { recursive: true });
    await writeFile(join(target, '.claude/.baseline-prior/CLAUDE.md'), '# baseline\nLINE A\nLINE B\n');

    const oldFakeDir = await mkdtemp(join(tmpdir(), 'old-snap-mech-conf-'));
    await writeFile(join(oldFakeDir, 'CLAUDE.md'), '# baseline\nLINE A\nLINE B\n');
    const oldM = {
      manifest_version: 2,
      baseline_version: '0.4.0',
      generated_at: '',
      files: { 'CLAUDE.md': await hashFile(join(oldFakeDir, 'CLAUDE.md')) },
    };
    const newM = {
      manifest_version: 3,
      generated_at: '',
      files: { 'CLAUDE.md': { sha256: await hashFile(join(tpl, 'CLAUDE.md')), tier: 'MECHANICAL' } },
    };

    const report = await merge.threeWayMerge(tpl, target, oldM, newM);

    const action = report.actions.find((a) => a.path === 'CLAUDE.md');
    assert.equal(action.kind, 'MECHANICAL_MERGE_CONFLICTED');
    assert.equal(report.exitCode, 4,
      'mechanical conflict on disk must raise overall exit code to 4');
  });

  it('test_when_threeWayMerge_user_added_file_then_no_action_no_read_no_write', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'merge-user-added-'));
    const userPath = join(target, 'docs/user-only.md');
    await mkdir(join(target, 'docs'), { recursive: true });
    const userContent = '# user-only file, never baseline-owned\n';
    await writeFile(userPath, userContent);

    const oldM = { manifest_version: 2, baseline_version: '0.4.0', generated_at: '', files: {} };
    const newM = { manifest_version: 3, generated_at: '', files: { 'CLAUDE.md': { sha256: await hashFile(join(tpl, 'CLAUDE.md')), tier: 'BINARY_PROMPT' } } };

    const report = await merge.threeWayMerge(tpl, target, oldM, newM);

    const userAction = report.actions.find((a) => a.path === 'docs/user-only.md');
    assert.equal(userAction, undefined,
      'a file absent from both oldManifest.files and newManifest.files must emit zero actions (Article XI compliance)');
    const after = await readFile(userPath, 'utf8');
    assert.equal(after, userContent, 'user-added file must be byte-identical after merge run');
  });

  it('test_when_threeWayMerge_existing_action_kinds_unchanged_regression', async () => {
    // Re-asserts that pre-rework action kinds still fire on the same fixtures.
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'merge-regression-'));
    await writeFile(join(target, 'CLAUDE.md'), '# baseline v2\n');

    const oldM = { manifest_version: 2, baseline_version: '0.4.0', generated_at: '', files: { 'CLAUDE.md': await hashFile(join(tpl, 'CLAUDE.md')) } };
    const newM = { manifest_version: 3, generated_at: '', files: { 'CLAUDE.md': { sha256: await hashFile(join(tpl, 'CLAUDE.md')), tier: 'BINARY_PROMPT' } } };

    const report = await merge.threeWayMerge(tpl, target, oldM, newM);

    const action = report.actions.find((a) => a.path === 'CLAUDE.md');
    assert.equal(action.kind, 'NOOP',
      'target byte-equal to new template → NOOP, unchanged by rework');
  });

  it('NEVER_TOUCH preserves project.json regardless of state', async () => {
    const tpl = await makeTemplateFixture();
    await writeFile(join(tpl, '.claude/project.json'), JSON.stringify({ configured: false }) + '\n').catch(async () => {
      await mkdir(join(tpl, '.claude'));
      await writeFile(join(tpl, '.claude/project.json'), JSON.stringify({ configured: false }) + '\n');
    });

    const target = await mkdtemp(join(tmpdir(), 'merge-target-'));
    await mkdir(join(target, '.claude'));
    const userPj = JSON.stringify({ configured: true, marker: 'user' }) + '\n';
    await writeFile(join(target, '.claude/project.json'), userPj);

    const oldM = { manifest_version: 1, generated_at: '', files: {} };
    const newM = await manifestOf(tpl, ['CLAUDE.md', '.claude/project.json']);

    await merge.threeWayMerge(tpl, target, oldM, newM);

    const after = await readFile(join(target, '.claude/project.json'), 'utf8');
    assert.equal(after, userPj);
  });
});
