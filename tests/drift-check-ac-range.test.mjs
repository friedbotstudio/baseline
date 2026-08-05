// Tests for drift_check.mjs AC range-notation expansion.
//
// `scoreAgainstDiff` matched an AC only when its id appeared LITERALLY in an added
// diff line. A file-header comment that names a span — `(AC-004..AC-008)`, the
// natural way to annotate a test file covering a ticket — therefore resolved only
// the two endpoints and reported every id inside the span as unimplemented.
//
// Observed live on architecture-map: 9 of 23 ACs reported unresolved while every
// one had a passing scenario. A drift signal that is wrong 39% of the time trains
// the reader to skip it, which is worse than no signal.
//
// Each test builds an isolated tmp git repo so the diff source is deterministic.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DRIFT = join(REPO_ROOT, '.claude/skills/tdd/drift_check.mjs');
const SLUG = 'drift-range';

function git(root, ...args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

function initRepo() {
  const root = mkdtempSync(join(tmpdir(), 'driftrange-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@test');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'commit', '--allow-empty', '-q', '-m', 'seed', '--no-gpg-sign');
  return root;
}

function writeSpec(root, acIds) {
  const dir = join(root, 'docs', 'specs');
  mkdirSync(dir, { recursive: true });
  const rows = acIds.map((id) => `| ${id} | criterion ${id} | test |`).join('\n');
  writeFileSync(
    join(dir, `${SLUG}.md`),
    [`# Spec — ${SLUG}`, '', '## Acceptance criteria', '', '| id | description | verified-by |', '|---|---|---|', rows, ''].join('\n'),
    'utf8',
  );
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

function runDrift(root) {
  const res = spawnSync('node', [DRIFT, '--slug', SLUG, '--project-root', root], { encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

function verdictOf(root, acId) {
  const report = readFileSync(join(root, '.claude', 'state', 'drift', `${SLUG}.md`), 'utf8');
  const m = report.match(new RegExp(`\\|\\s*ac\\s*\\|\\s*${acId}\\s*\\|\\s*(\\w+)\\s*\\|`));
  return m ? m[1] : null;
}

describe('drift_check AC range notation', () => {
  it('test_when_diff_names_ac_range_then_interior_ids_resolve', () => {
    const root = initRepo();
    writeSpec(root, ['AC-004', 'AC-005', 'AC-006', 'AC-007', 'AC-008']);
    writeFile(root, 'impl.mjs', 'placeholder\n');
    commit(root, ['docs/specs/drift-range.md', 'impl.mjs'], 'spec + placeholder');

    writeFile(root, 'impl.mjs', '// Ticket B — edge derivation (AC-004..AC-008).\nexport const done = true;\n');
    const res = runDrift(root);

    for (const id of ['AC-004', 'AC-005', 'AC-006', 'AC-007', 'AC-008']) {
      assert.equal(verdictOf(root, id), 'resolved', `${id} is inside the named span and must resolve`);
    }
    assert.equal(res.status, 0, 'a fully-covered spec must exit 0');
  });

  it('test_when_range_is_spaced_or_hyphenated_then_still_expands', () => {
    const root = initRepo();
    writeSpec(root, ['AC-001', 'AC-002', 'AC-003']);
    writeFile(root, 'impl.mjs', 'placeholder\n');
    commit(root, ['docs/specs/drift-range.md', 'impl.mjs'], 'spec + placeholder');

    writeFile(root, 'impl.mjs', '// covers AC-001 .. AC-003\nexport const done = true;\n');
    // ONE run, then assert. Re-running before asserting made this test pass for the
    // wrong reason: the first run's report is an untracked file whose rows contain
    // every AC id verbatim, so the second run scored ids against the checker's own
    // output. That is the self-contamination the next test pins down.
    runDrift(root);
    for (const id of ['AC-001', 'AC-002', 'AC-003']) {
      assert.equal(verdictOf(root, id), 'resolved', `${id} must resolve through a spaced range`);
    }
  });

  it('test_when_ac_outside_the_named_range_then_still_unresolved', () => {
    const root = initRepo();
    writeSpec(root, ['AC-004', 'AC-005', 'AC-009']);
    writeFile(root, 'impl.mjs', 'placeholder\n');
    commit(root, ['docs/specs/drift-range.md', 'impl.mjs'], 'spec + placeholder');

    // The span stops at AC-005. AC-009 is genuinely unimplemented and the
    // expansion must NOT paper over it — that would turn a weak signal into a
    // false one, which is the opposite of the fix.
    writeFile(root, 'impl.mjs', '// covers AC-004..AC-005\nexport const done = true;\n');
    const res = runDrift(root);

    assert.equal(verdictOf(root, 'AC-004'), 'resolved');
    assert.equal(verdictOf(root, 'AC-005'), 'resolved');
    assert.equal(verdictOf(root, 'AC-009'), 'unresolved', 'an id outside the span must stay unresolved');
    assert.equal(res.status, 1, 'a genuinely uncovered AC must still fail the gate');
  });

  // The checker writes its report to .claude/state/drift/<slug>.md. That file is
  // untracked, and every row contains an AC id verbatim — so on a SECOND run the
  // report is scored as evidence for the very ids it reported unresolved, and the
  // drift gate silently turns green. Only gitignoring .claude/state/ hides this,
  // which is why it never bit the baseline repo itself but would bite a consumer.
  it('test_when_drift_runs_twice_then_its_own_report_is_not_evidence', () => {
    const root = initRepo();
    writeSpec(root, ['AC-001', 'AC-002']);
    writeFile(root, 'impl.mjs', 'placeholder\n');
    commit(root, ['docs/specs/drift-range.md', 'impl.mjs'], 'spec + placeholder');

    writeFile(root, 'impl.mjs', '// implements AC-001 only\nexport const done = true;\n');
    const first = runDrift(root);
    assert.equal(verdictOf(root, 'AC-002'), 'unresolved', 'AC-002 is genuinely unimplemented');
    assert.equal(first.status, 1);

    const second = runDrift(root);
    assert.equal(
      verdictOf(root, 'AC-002'),
      'unresolved',
      'a second run must NOT resolve AC-002 against the first run\'s own report',
    );
    assert.equal(second.status, 1, 'the gate must stay red across repeated runs');
  });

  it('test_when_range_is_reversed_then_it_is_not_treated_as_a_span', () => {
    const root = initRepo();
    writeSpec(root, ['AC-002']);
    writeFile(root, 'impl.mjs', 'placeholder\n');
    commit(root, ['docs/specs/drift-range.md', 'impl.mjs'], 'spec + placeholder');

    // `AC-008..AC-004` is malformed. Treating it as a span would silently resolve
    // ids the author never claimed; a malformed range resolves nothing.
    writeFile(root, 'impl.mjs', '// covers AC-008..AC-004\nexport const done = true;\n');
    const res = runDrift(root);

    assert.equal(verdictOf(root, 'AC-002'), 'unresolved', 'a reversed span must not resolve anything');
    assert.equal(res.status, 1);
  });
});
