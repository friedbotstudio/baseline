// The sweep and the session-start hook must agree on what is stale.
//
// They did not. sweep.mjs kept its own copy of the category sets and never got
// the SUPERSESSION_DRIVEN guard, so at 1b2b0c7 it called 287 entries stale where
// the hook called 248 — 40 of them decisions, which categories.mjs says expire by
// being superseded and never by age. It also omitted `constraints` from its
// canonical list, so no sweep mode could see that category at all.
//
// categories.mjs is the registry both are supposed to read; its own header records
// that this list was once hardcoded in eight places and that "missing one was a
// SILENT failure". sweep.mjs was a ninth.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  REPO_ROOT,
  tryImport,
  makeProject,
  writeShard,
  copyLiveCorpus,
  CANONICAL_CATEGORIES,
} from './helpers/memory-fixtures.mjs';

const SWEEP_REL = '.claude/skills/memory-sync/sweep.mjs';
const HOOK_REL = '.claude/hooks/lib/memory_session_start.mjs';
const SHAPE_REL = '.claude/skills/memory-sync/shape.mjs';

let sweep;
let hook;
let shape;

before(async () => {
  sweep = await tryImport(SWEEP_REL);
  hook = await tryImport(HOOK_REL);
  shape = await tryImport(SHAPE_REL);
  assert.ok(sweep, `${SWEEP_REL} must import cleanly`);
  assert.ok(hook, `${HOOK_REL} must import cleanly`);
  assert.ok(shape, `${SHAPE_REL} must import cleanly`);
  assert.equal(
    typeof sweep.isStale, 'function',
    'sweep.mjs must export isStale — the parity this suite pins cannot be measured through a private predicate',
  );
  assert.equal(
    typeof hook.isStale, 'function',
    'memory_session_start.mjs must export isStale — it is the reference predicate the sweep has to match',
  );
});

// The predicate takes a flat entry block. The hook builds one from sharded
// frontmatter expressly "so the exact isStale predicate applies unchanged", and
// the sweep reads sharded-as-flat, so both sides accept this shape.
function entryBlock(fields) {
  const lines = Object.entries(fields).map(([k, v]) => `- ${k}: ${v}`);
  return ['## some-entry-key', '', ...lines, ''].join('\n');
}

function entriesOf(memDir, category) {
  if (!shape.categoryIsSharded(memDir, category)) return [];
  const { text } = shape.readShardedAsFlat(memDir, category);
  const body = text.startsWith('---') ? text.slice(text.indexOf('\n---', 3) + 4) : text;
  const parts = body.split(/(^##\s+\S.*)$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) out.push(parts[i] + (parts[i + 1] ?? ''));
  return out;
}

function liveHead() {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

describe('sweep vs session-start — the staleness predicate has one meaning', () => {
  it('test_when_predicates_run_over_live_store_then_every_entry_gets_the_same_verdict', () => {
    // The live corpus, not a synthetic one: the divergence was measured there and a
    // hand-built store would not have carried the 40 aged decisions that exposed it.
    const { root, memDir } = copyLiveCorpus('sweep-parity-');
    try {
      const head = liveHead();
      const disagreements = [];
      let examined = 0;
      for (const category of CANONICAL_CATEGORIES) {
        for (const block of entriesOf(memDir, category)) {
          examined += 1;
          const bySweep = sweep.isStale(block, category, head, REPO_ROOT);
          const byHook = hook.isStale(block, category, head, REPO_ROOT);
          if (bySweep !== byHook) {
            disagreements.push(`${category}: sweep=${bySweep} hook=${byHook} :: ${block.split('\n')[0]}`);
          }
        }
      }
      assert.ok(examined > 0, 'the copied corpus must yield entries, or this test passes vacuously');
      assert.deepEqual(
        disagreements.slice(0, 8), [],
        `${disagreements.length} of ${examined} entries got different verdicts from the two predicates`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_a_decisions_entry_is_older_than_the_threshold_then_sweep_does_not_call_it_stale', () => {
    // The bug, isolated. A decision expires by being superseded; elapsed time is noise.
    const aged = entryBlock({ 'verified-at': 'HEAD', 'last-touched': '2020-01-01' });
    assert.equal(
      hook.isStale(aged, 'decisions', null, REPO_ROOT), false,
      'reference predicate: an open decision is never stale by age',
    );
    assert.equal(
      sweep.isStale(aged, 'decisions', null, REPO_ROOT), false,
      'sweep must honour SUPERSESSION_DRIVEN — this is the guard that surfaced 40 decisions for deletion',
    );
  });

  it('test_when_a_constraints_entry_is_older_than_the_threshold_then_sweep_does_call_it_stale', () => {
    // Guards the fix from overshooting. categories.mjs decision B3 puts constraints in
    // NEITHER exempt set, so age decay is the correct pressure on it.
    const aged = entryBlock({ 'verified-at': 'HEAD', 'last-touched': '2020-01-01' });
    assert.equal(
      hook.isStale(aged, 'constraints', null, REPO_ROOT), true,
      'reference predicate: a constraint is mutable and re-verifiable, so it decays',
    );
    assert.equal(
      sweep.isStale(aged, 'constraints', null, REPO_ROOT), true,
      'exempting constraints alongside decisions would be an over-correction',
    );
  });

  it('test_when_sweep_walks_its_canonical_list_then_constraints_is_included', () => {
    // Predicate parity is not enough: sweep also has to REACH the category. Its local
    // seven-item list meant no mode could ever see constraints, silently.
    const { root, memDir } = makeProject();
    try {
      const shard = writeShard(memDir, 'constraints', 'a-closed-constraint', {
        key: 'a-closed-constraint',
        fields: { 'superseded-at': '2026-01-01', 'verified-at': 'HEAD', 'last-touched': '2026-01-01' },
        bodyLines: ['A constraint that has been superseded and should auto-close.'],
      });
      const report = sweep.runSweep({ mode: 'auto-close', rootDir: root, memoryDir: memDir });
      assert.equal(
        report.closed, 1,
        'auto-close must reach constraints; a zero here means the category is invisible to every sweep mode',
      );
      assert.ok(!existsSync(shard), 'the superseded constraint entry must be removed');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_sweep_source_is_read_then_the_category_sets_are_imported_not_redeclared', () => {
    // Same shape as the PARTS repair at 12effd8. A second copy of a rule drifts, and
    // then the check that compares the two copies compares two wrongs.
    const source = readFileSync(join(REPO_ROOT, SWEEP_REL), 'utf8');
    assert.doesNotMatch(
      source, /^\s*const CANONICAL_FILES\s*=/m,
      'sweep.mjs must not declare its own canonical list — categories.mjs owns it',
    );
    assert.doesNotMatch(
      source, /^\s*const STALE_EXEMPT_FILES\s*=/m,
      'sweep.mjs must not declare its own exempt set — categories.mjs owns it',
    );
    assert.doesNotMatch(
      source, /^\s*function closureFieldFor\s*\(/m,
      'sweep.mjs must not redeclare closureFieldFor — categories.mjs exports it',
    );
    assert.match(
      source,
      /import\s*\{[^}]*\bSUPERSESSION_DRIVEN\b[^}]*\}\s*from\s*'\.\.\/memory-index\/categories\.mjs'/,
      'sweep.mjs must import the decay classes from the registry that owns them',
    );
  });
});
