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

// The verdict alone cannot tell a resolution earned by real coverage from one
// earned by prose that merely discusses the id. AC-011 exists because both read
// `resolved`, so the citation is the only thing that separates them.
function evidenceOf(report, acId) {
  const m = report.match(new RegExp(`\\|\\s*ac\\s*\\|\\s*${acId}\\s*\\|\\s*\\w+\\s*\\|([^|]*)\\|`));
  return m ? m[1].trim() : null;
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

  it('test_when_spec_untracked_and_no_impl_then_unresolved_not_self_pass', () => {
    // a1b2: the spec is uncommitted (the real pre-commit /tdd state). No impl
    // references the AC. Before the fix, the untracked spec's own `| AC-001 |`
    // row self-satisfied → false 'resolved' + exit 0. After excluding docs/specs/
    // from the scored diff, the AC is correctly unresolved.
    const root = initRepo();
    writeSpec(root, ['AC-001']);
    // Note: spec is NOT committed and NOT referenced by any impl file.
    const res = runDrift(root);
    assert.equal(res.status, 1, `expected exit 1, got ${res.status}\n${res.stderr}`);
    assert.equal(verdictOf(readReport(root), 'AC-001'), 'unresolved');
  });

  it('test_when_spec_untracked_but_impl_references_ac_then_resolved', () => {
    // The exclusion must not over-filter: a genuine impl reference still resolves
    // even while the spec itself sits untracked in the tree.
    const root = initRepo();
    writeSpec(root, ['AC-001']);
    writeFile(root, 'impl.txt', 'implements AC-001 here\n');
    const res = runDrift(root);
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}\n${res.stderr}`);
    assert.equal(verdictOf(readReport(root), 'AC-001'), 'resolved');
  });

  it('test_when_tracked_spec_edit_does_not_self_satisfy', () => {
    // A spec committed and then EDITED in the working tree is part of `git diff
    // HEAD`; the exclude pathspec must keep its AC rows out of the scored diff.
    const root = initRepo();
    writeSpec(root, ['AC-007']);
    commit(root, ['docs/specs/drift-wt.md'], 'spec only');
    // Edit the tracked spec (adds/touches the AC row in the working-tree diff).
    writeSpec(root, ['AC-007', 'AC-008']);
    const res = runDrift(root);
    assert.equal(res.status, 1, `expected exit 1, got ${res.status}\n${res.stderr}`);
    assert.equal(verdictOf(readReport(root), 'AC-007'), 'unresolved');
    assert.equal(verdictOf(readReport(root), 'AC-008'), 'unresolved');
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

// AC-011 — an AC resolves against implementation and test, never workflow prose.
//
// Found live: this ticket's own drift tick reported two of its criteria `resolved`,
// citing added lines in `docs/audits/swarm-first-production-run-2026-08-09.md`, an
// untracked report from an earlier session that merely discusses those ids. Both
// did have real coverage, so the verdicts were right by accident — a criterion with
// no coverage at all would have passed identically.
//
// Their ids are deliberately not spelled here. A file that names a criterion it
// does not cover becomes the next false witness, since the exclusion is path-based
// and this file is legitimately scored.
//
// `docs/specs/` and `docs/archive/` were already excluded for exactly this reason;
// the remaining per-workflow report directories were not. Each one gets a case so
// the exclusion cannot be narrowed back to a single directory unnoticed.
const REPORT_DIRS = ['docs/audits', 'docs/rca', 'docs/security', 'docs/intake', 'docs/scout', 'docs/research', 'docs/brief'];

describe('drift_check — workflow prose is not evidence (AC-011)', () => {
  for (const dir of REPORT_DIRS) {
    it(`test_when_ac_only_in_${dir.replace(/[^\w]/g, '_')}_prose_then_unresolved`, () => {
      const root = initRepo();
      writeSpec(root, ['AC-011']);
      writeFile(root, `${dir}/prior-workflow.md`, 'A report discussing AC-011 at length.\n');

      const res = runDrift(root);

      assert.equal(res.status, 1, `expected exit 1, got ${res.status}\n${res.stderr}`);
      assert.equal(
        verdictOf(readReport(root), 'AC-011'),
        'unresolved',
        `a report under ${dir}/ describes work; it never implements it, so it must not satisfy an AC`,
      );
    });
  }

  it('test_when_ac_is_in_impl_and_also_in_report_prose_then_evidence_cites_the_impl', () => {
    const root = initRepo();
    writeSpec(root, ['AC-011']);
    // The prose sorts BEFORE the implementation in the untracked walk, so it is
    // scored first and wins the citation unless it is excluded outright. That
    // ordering is what made the live report cite an unrelated audit document.
    writeFile(root, 'docs/audits/prior-workflow.md', 'A report discussing AC-011 at length.\n');
    writeFile(root, 'src/impl.mjs', '// AC-011 — the real implementation.\nexport const done = true;\n');

    const res = runDrift(root);
    const report = readReport(root);

    assert.equal(res.status, 0, `expected exit 0, got ${res.status}\n${res.stderr}`);
    assert.equal(verdictOf(report, 'AC-011'), 'resolved', 'genuine coverage must still resolve — the exclusion must not over-filter');
    assert.match(
      evidenceOf(report, 'AC-011'),
      /the real implementation/,
      'the cited line must be the implementation, not the report prose — a resolution nobody can trace is not proof',
    );
  });
});
