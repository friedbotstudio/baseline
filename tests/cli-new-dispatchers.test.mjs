// Dispatcher sweep — the two new Pattern A dispatchers (AC-012, AC-013).
//
// `document` earns a dispatcher because two of its three modules are cited and the
// pair groups naturally. `commit` earns one for the reason D3 records: the call
// site's target is `.claude/hooks/lib/common.mjs`, whose element is FILE-anchored,
// so a CLI beside it would be an uncovered governed path. Routing through
// commit/cli.mjs puts the front door inside a glob-anchored element instead, and
// the skills→hooks import it needs is established precedent (workspace/delta.mjs
// already imports ../../hooks/lib/slug.mjs).
//
// `receipt` is the fourth of the five write paths, so it carries the same W-1
// obligation as the corpus writers even though its Domain module is not the
// corpus. The traversal leg below is what makes that concrete.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';
import { runCli, runCliJson, assertPresent, snapshotDir } from './helpers/cli-runner.mjs';

const mkdtemp = () => mkdtempSync(join(tmpdir(), 'newdisp-'));

describe('document dispatcher', () => {
  // AC-012
  it('test_when_document_cli_receipt_runs_then_receipt_appended', async () => {
    const root = mkdtemp();
    mkdirSync(join(root, '.claude', 'state'), { recursive: true });

    const res = runCli('document', [
      'receipt', '--slug', 'demo', '--surface', 'docs/guide.md', '--delegate', 'technical-writer', '--root', root,
    ], { cwd: root });
    assertPresent(assert, res);
    assert.equal(res.status, 0, `receipt must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);

    const receipts = await tryImport('.claude/skills/document/receipts.mjs');
    assert.ok(receipts && typeof receipts.readReceipts === 'function', 'receipts.mjs must export readReceipts for the cross-check');
    const stored = receipts.readReceipts({ slug: 'demo', rootDir: root });
    assert.ok(
      JSON.stringify(stored).includes('technical-writer'),
      'the receipt the CLI reported must be the receipt readReceipts returns — otherwise the front door wrote somewhere else',
    );
  });

  // AC-012 / W-1 — receipt is a write path and inherits the whole contract
  it('test_when_document_cli_receipt_given_traversal_slug_then_rejected_and_nothing_written', () => {
    const root = mkdtemp();
    mkdirSync(join(root, '.claude', 'state'), { recursive: true });
    const before = snapshotDir(join(root, '.claude'));

    const res = runCli('document', [
      'receipt', '--slug', '../../etc/passwd', '--surface', 's', '--delegate', 'd', '--root', root,
    ], { cwd: root });
    assertPresent(assert, res);
    assert.equal(res.status, 1, 'a traversal slug is a validation error on the fourth write path exactly as on the first three');
    assert.ok(!/ENOENT/i.test(res.out), 'ENOENT means the path was built before it was checked');
    assert.deepEqual(snapshotDir(join(root, '.claude')), before, 'a rejected receipt must leave the tree byte-identical');
  });

  // AC-012
  //
  // Keyed on --touched, not --slug. findDescribedSurfaces takes `changedPaths` and
  // derives tokens from them; it has never taken a slug. The spec's Contracts row
  // said `--slug` and was corrected against the real signature and the SOP call
  // site at document/SKILL.md:68, which already passes `{changedPaths: <diff paths>}`.
  it('test_when_document_cli_surfaces_runs_then_described_surfaces_returned', async () => {
    const mod = await tryImport('.claude/skills/document/public-site-reflect.mjs');
    assert.ok(mod && typeof mod.findDescribedSurfaces === 'function', 'public-site-reflect.mjs must export findDescribedSurfaces');

    const touched = '.claude/skills/workspace/cli.mjs,.claude/skills/lib/argv.mjs';
    const res = runCliJson('document', ['surfaces', '--touched', touched, '--json'], { cwd: REPO_ROOT });
    assertPresent(assert, res);
    assert.equal(res.status, 0, `surfaces must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);
    assert.ok(res.json !== null, `surfaces --json must emit parseable JSON; got: ${res.stdout.slice(0, 200)}`);

    const direct = mod.findDescribedSurfaces({ changedPaths: touched.split(','), root: REPO_ROOT });
    assert.deepEqual(
      res.json,
      JSON.parse(JSON.stringify(direct)),
      'surfaces must return exactly what findDescribedSurfaces returns — a front door, not a second implementation',
    );
  });

  // AC-012 — the empty-diff case is a caller mistake, not a clean result
  it('test_when_document_cli_surfaces_given_no_touched_then_usage_error', () => {
    const res = runCli('document', ['surfaces'], { cwd: REPO_ROOT });
    assertPresent(assert, res);
    assert.equal(res.status, 1, 'an empty token set returns [] from the Domain function, which would read as "nothing matched"');
  });

  // AC-012
  it('test_when_document_help_runs_then_both_subcommands_listed', () => {
    const res = runCli('document', ['--help']);
    assertPresent(assert, res);
    assert.equal(res.status, 0, `--help must exit 0; got ${res.status}`);
    for (const name of ['receipt', 'receipts', 'surfaces']) {
      assert.match(res.stdout, new RegExp(`^\\s+${name}\\s{2,}\\S`, 'm'), `--help must list ${name} with a summary`);
    }
  });
});

describe('commit dispatcher', () => {
  // AC-013
  //
  // Compared against the in-process predicate rather than against a literal. The
  // answer depends on the branch the suite happens to run on, so a literal `false`
  // would be green today and wrong the first time someone runs the suite on a
  // feature branch. What the AC actually claims is that the two agree.
  it('test_when_commit_cli_is_autonomous_landing_runs_then_matches_direct_call', async () => {
    const res = runCli('commit', ['is-autonomous-landing'], { cwd: REPO_ROOT });
    assertPresent(assert, res);
    assert.equal(res.status, 0, `is-autonomous-landing must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);

    const common = await tryImport('.claude/hooks/lib/common.mjs');
    assert.ok(common && typeof common.isAutonomousFeatureLanding === 'function', 'hooks/lib/common.mjs must export isAutonomousFeatureLanding');
    const direct = common.isAutonomousFeatureLanding();

    assert.match(res.stdout.trim(), /^(true|false)$/, 'the predicate must print a bare boolean a shell can branch on');
    assert.equal(
      res.stdout.trim(),
      String(direct),
      'the CLI and the in-process predicate must agree — commit/SKILL.md branches on this to decide whether to push and open a PR',
    );
  });

  // AC-013 / D3 — the cross-boundary import is the decision, so it is asserted
  it('test_when_commit_cli_read_then_it_imports_the_hooks_lib_rather_than_reimplementing', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const path = join(REPO_ROOT, '.claude/skills/commit/cli.mjs');
    assert.ok(existsSync(path), 'commit/cli.mjs must exist — the D3 front door');
    const text = readFileSync(path, 'utf8');
    assert.ok(text.length > 0, 'commit/cli.mjs must be non-empty before its content can be checked');
    assert.match(
      text,
      /hooks\/lib\/common\.mjs/,
      'D3 routes this through the existing hooks lib; a reimplemented predicate would drift from the one git_commit_guard uses',
    );
  });
});
