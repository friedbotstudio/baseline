// Tests for drift_check.mjs working-tree diff sourcing.
// Backlog: drift-check-diffs-committed-history-noop-pre-commit-d1f7
//
// drift_check.mjs scores spec ACs against an implementation diff. The diff
// source MUST be the WORKING TREE (uncommitted changes + intent-to-add
// untracked files), not `git diff <merge-base>..HEAD` — during the pre-commit
// /tdd phase the workflow code is still uncommitted, so committed history is
// empty and every AC would otherwise report `unresolved`.
//
// Each test builds an isolated tmp git repo (NOT this repo's live dir) so the
// diff source is deterministic.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DRIFT = join(REPO_ROOT, '.claude/skills/tdd/drift_check.mjs');
const SLUG = 'drift-wt';

function git(root, ...args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

function initRepo() {
  const root = mkdtempSync(join(tmpdir(), 'driftwt-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@test');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'commit', '--allow-empty', '-q', '-m', 'seed', '--no-gpg-sign');
  return root;
}

function writeSpec(root, acIds) {
  const dir = join(root, 'docs', 'specs');
  mkdirSync(dir, { recursive: true });
  const rows = acIds.map(id => `| ${id} | criterion ${id} | test |`).join('\n');
  const body = [
    `# Spec — ${SLUG}`,
    '',
    '## Acceptance criteria',
    '',
    '| id | description | verified-by |',
    '|---|---|---|',
    rows,
    '',
  ].join('\n');
  writeFileSync(join(dir, `${SLUG}.md`), body, 'utf8');
}

function writeFile(root, relPath, content) {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
}

function commit(root, relPaths, msg) {
  for (const p of relPaths) git(root, 'add', p);
  git(root, 'commit', '-q', '-m', msg, '--no-gpg-sign');
}

function runDrift(root, extraArgs = []) {
  const res = spawnSync('node', [DRIFT, '--slug', SLUG, '--project-root', root, ...extraArgs], {
    encoding: 'utf8',
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

function readReport(root) {
  return readFileSync(join(root, '.claude', 'state', 'drift', `${SLUG}.md`), 'utf8');
}

function verdictOf(report, acId) {
  const m = report.match(new RegExp(`\\|\\s*ac\\s*\\|\\s*${acId}\\s*\\|\\s*(\\w+)\\s*\\|`));
  return m ? m[1] : null;
}

describe('drift_check working-tree diff sourcing', () => {
  it('test_when_uncommitted_change_references_ac_then_resolved', () => {
    const root = initRepo();
    writeSpec(root, ['AC-001']);
    writeFile(root, 'src.txt', 'placeholder, no ac yet\n');
    commit(root, ['docs/specs/drift-wt.md', 'src.txt'], 'spec + placeholder impl');

    // Uncommitted working-tree edit that references the AC.
    writeFile(root, 'src.txt', 'now implements AC-001 behavior\n');

    const res = runDrift(root);
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}\n${res.stderr}`);
    assert.equal(verdictOf(readReport(root), 'AC-001'), 'resolved');
  });

  it('test_when_ac_only_in_untracked_file_then_resolved', () => {
    const root = initRepo();
    writeSpec(root, ['AC-002']);
    commit(root, ['docs/specs/drift-wt.md'], 'spec only');

    // Brand-new untracked file referencing the AC — never git add.
    writeFile(root, 'new-component.txt', 'covers AC-002 here\n');

    const res = runDrift(root);
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}\n${res.stderr}`);
    assert.equal(verdictOf(readReport(root), 'AC-002'), 'resolved');
  });

  it('test_when_committed_but_working_tree_clean_then_unresolved', () => {
    const root = initRepo();
    writeSpec(root, ['AC-001']);
    writeFile(root, 'src.txt', 'implements AC-001 behavior\n');
    // Both the spec and the AC-referencing impl are committed; working tree clean.
    commit(root, ['docs/specs/drift-wt.md', 'src.txt'], 'spec + impl referencing AC-001');

    const res = runDrift(root);
    // Working tree is clean, so the AC reference (only in committed history) is NOT scored.
    assert.equal(res.status, 1, `expected exit 1, got ${res.status}\n${res.stderr}`);
    assert.equal(verdictOf(readReport(root), 'AC-001'), 'unresolved');
  });

  it('test_when_diff_override_given_then_uses_file_not_git', () => {
    const root = initRepo();
    writeSpec(root, ['AC-001']);
    commit(root, ['docs/specs/drift-wt.md'], 'spec only');

    // git working tree is clean; the override diff file carries the AC reference.
    const diffPath = join(root, 'override.diff');
    writeFileSync(diffPath, '+ implements AC-001 in override\n', 'utf8');

    const res = runDrift(root, ['--diff', diffPath]);
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}\n${res.stderr}`);
    assert.equal(verdictOf(readReport(root), 'AC-001'), 'resolved');
  });
});
