// Skill-helper CLI dispatchers — the three non-workspace front doors, plus the
// regression trap that keeps them additive (AC-001, AC-005, regression).
//
// memory-flush, system-reconcile and memory-index each own a handful of
// hand-invoked modules. Their dispatchers are thinner than workspace's, so the
// assertions here concentrate on the two things that can actually go wrong: a
// write subcommand that accepts a bad value, and a dispatcher that reshapes the
// Domain module's output instead of forwarding it.
//
// The last test is the one that defends the whole design. These dispatchers are
// Orchestration ADDED OVER unchanged Domain modules (spec Non-goals). If an
// export disappears because a module got "tidied" while a CLI was bolted on, the
// change stopped being additive and every existing importer breaks.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport, REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { runCli, assertPresent } from './helpers/cli-runner.mjs';

const SPEC_DIR = 'docs/system';

describe('memory-flush dispatcher', () => {
  // AC-005
  //
  // The key MUST be a well-formed candidate key (isCandidateKey requires the
  // ` → ` separator). A bare key is refused on key shape before the disposition
  // is ever examined, which would make this test pass for the wrong reason and
  // stay green even if the disposition check were deleted. The invalid
  // disposition has to be the sole distinguishing input.
  it('test_when_memory_flush_ledger_disposition_invalid_then_rejected_and_ledger_unchanged', async () => {
    const mod = await tryImport('.claude/skills/memory-flush/ledger.mjs');
    assert.ok(mod, 'ledger.mjs must be importable to resolve the ledger path');

    const { root, memDir } = makeProject();
    mkdirSync(memDir, { recursive: true });
    const ledger = mod.ledgerPath(root);
    const validKey = mod.candidateKey('backlog', 'demo-entry');
    assert.ok(mod.isCandidateKey(validKey), 'fixture precondition: the key must be well-formed');

    const seeded = '# discard ledger\n\n- existing row\n';
    writeFileSync(ledger, seeded, 'utf8');

    const res = runCli('memory-flush', [
      'ledger', '--key', validKey, '--disposition', 'bogus', '--root', root,
    ]);
    assertPresent(assert, res);
    assert.equal(res.status, 1, 'an unknown disposition must exit 1');
    assert.match(res.out, /disposition|promoted|discarded/i, 'the rejection must name the legal values');
    assert.equal(
      readFileSync(ledger, 'utf8'),
      seeded,
      'a rejected write must leave the ledger byte-identical — validation precedes the append',
    );
  });

  // AC-001
  it('test_when_memory_flush_stale_elements_runs_then_report_emitted', () => {
    const res = runCli('memory-flush', ['stale-elements']);
    assertPresent(assert, res);
    assert.equal(res.status, 0, `stale-elements must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);
  });
});

describe('system-reconcile dispatcher', () => {
  // AC-001
  it('test_when_system_reconcile_report_runs_then_seven_check_report_emitted', async () => {
    const res = runCli('system-reconcile', ['report']);
    assertPresent(assert, res);
    assert.equal(res.status, 0, `report must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);

    const mod = await tryImport('.claude/skills/system-reconcile/reconcile-report.mjs');
    assert.ok(mod, 'reconcile-report.mjs must be importable for the cross-check');
    const direct = mod.runReconcile({ specDir: join(REPO_ROOT, SPEC_DIR), rootDir: REPO_ROOT });
    for (const check of Object.keys(direct)) {
      assert.ok(
        res.stdout.includes(check),
        `the dispatcher must forward every check the module reports; missing \`${check}\``,
      );
    }
  });
});

describe('memory-index dispatcher', () => {
  // AC-005
  it('test_when_memory_index_assert_writable_given_malformed_json_then_exit_1', () => {
    const res = runCli('memory-index', ['assert-writable', '{not json']);
    assertPresent(assert, res);
    assert.equal(res.status, 1, 'malformed JSON is a usage error, exit 1');
    assert.match(res.out, /json|parse/i, 'the error must say the payload failed to parse');
  });

  // AC-005
  it('test_when_memory_index_constraint_state_not_boolean_then_exit_1', () => {
    const { root } = makeProject();
    const res = runCli('memory-index', [
      'constraint', '--key', 'demo', '--state', 'perhaps', '--governs', 'src/**', '--root', root,
    ]);
    assertPresent(assert, res);
    assert.equal(res.status, 1, 'a non-boolean state must exit 1');
    assert.match(res.out, /state/i, 'the rejection must name the offending flag');
  });
});

describe('dispatchers stay additive', () => {
  // regression — spec Non-goals: "No change to the Domain modules' logic."
  it('test_when_existing_library_exports_imported_then_all_still_resolve', async () => {
    const expected = {
      '.claude/skills/workspace/edges.mjs': ['deriveEdges'],
      '.claude/skills/workspace/store.mjs': ['readRecords', 'readAll'],
      '.claude/skills/workspace/render.mjs': ['composeView', 'generateView', 'findOrphanShards'],
      '.claude/skills/workspace/concepts.mjs': ['readConcepts', 'conceptsFor'],
      '.claude/skills/workspace/coverage.mjs': ['findGaps'],
      '.claude/skills/workspace/shards.mjs': ['writeDiagramShard', 'readShard'],
      '.claude/skills/workspace/flags.mjs': ['architectureMapEnabled'],
      '.claude/skills/workspace/roll.mjs': ['roll'],
      '.claude/skills/memory-flush/route.mjs': ['suggestRoutes'],
      '.claude/skills/memory-flush/ledger.mjs': ['recordCuration'],
      '.claude/skills/system-reconcile/reconcile-report.mjs': ['runReconcile'],
      '.claude/skills/memory-index/resolve.mjs': ['assertWritable'],
    };

    for (const [rel, names] of Object.entries(expected)) {
      assert.ok(existsSync(join(REPO_ROOT, rel)), `${rel} must still exist — dispatchers are additive`);
      const mod = await tryImport(rel);
      assert.ok(mod, `${rel} must still be importable as a library`);
      for (const name of names) {
        assert.equal(
          typeof mod[name],
          'function',
          `${rel} must still export \`${name}\` — adding a CLI must not move or rename Domain exports`,
        );
      }
    }
  });
});
