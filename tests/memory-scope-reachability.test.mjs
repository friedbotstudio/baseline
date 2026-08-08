// Scenarios for the two-leg reachability predicate — AC-001 and AC-002 of
// docs/specs/memory-scope-per-entry.md. Covers §Behavior #1.
//
// The defect these defend: `backfillScopeAny` stamps `scope: any` to make a fact
// reachable, and `scoped-memory.mjs` matches scope by `.includes(phase)`, so
// `['any'].includes('spec')` is false and all 47 stamped entries surface nowhere.
// The fix replaces the placeholder with a predicate over BOTH legs — phase scope
// or `governs:` — so an entry reached only by path is correctly reachable.
//
// RED until isReachable / assertWritable / UnreachableScopeError land in
// .claude/skills/memory-index/resolve.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, writeShard, tryImport } from './helpers/memory-fixtures.mjs';

const RESOLVE = '.claude/skills/memory-index/resolve.mjs';

async function loadResolve() {
  const mod = await tryImport(RESOLVE);
  assert.ok(mod, `${RESOLVE} must be importable`);
  return mod;
}

// The predicate reads an ENTRY, not a frontmatter line array — that widening is
// the point of AC-001, because `governs:` lives outside the scope line entirely.
function entryWith(fields) {
  return { key: fields.key ?? 'fact-under-test', category: fields.category ?? 'landmines', fields };
}

// Seed a real shard too, so a predicate that reads from disk rather than from the
// passed entry still exercises the same fixture rather than silently reading [].
function seedEntry(memDir, slug, fields) {
  return writeShard(memDir, fields.category ?? 'landmines', slug, {
    key: fields.key ?? slug,
    fields,
    bodyLines: ['> verbatim (test, 2026-08-08):', '> a lesson worth surfacing', '', 'Interpretation line.'],
  });
}

describe('memory scope — reachability predicate (AC-001)', () => {
  it('test_when_scope_intersects_phase_then_isReachable_true', async () => {
    const { memDir } = makeProject();
    seedEntry(memDir, 'phase-reachable', { key: 'phase-reachable', scope: '[spec]' });
    const { isReachable } = await loadResolve();

    assert.equal(
      isReachable(entryWith({ key: 'phase-reachable', scope: ['spec'], governs: [] })),
      true,
      'an entry scoped to a real phase is reachable via the phase leg',
    );
  });

  it('test_when_scope_empty_but_governs_populated_then_isReachable_true', async () => {
    const { memDir } = makeProject();
    seedEntry(memDir, 'path-reachable', {
      key: 'path-reachable',
      category: 'decisions',
      scope: '[]',
      governs: '.claude/hooks/**',
    });
    const { isReachable } = await loadResolve();

    assert.equal(
      isReachable(entryWith({ key: 'path-reachable', scope: [], governs: ['.claude/hooks/**'] })),
      true,
      'an entry with no phase scope is still reachable when governs: carries a glob — this is what makes eliminating `scope: any` safe',
    );
  });

  it('test_when_scope_key_absent_then_isReachable_false_and_assertWritable_throws', async () => {
    const { memDir } = makeProject();
    seedEntry(memDir, 'no-scope-key', { key: 'no-scope-key' });
    const { isReachable, assertWritable } = await loadResolve();
    const entry = entryWith({ key: 'no-scope-key' });

    assert.equal(isReachable(entry), false, 'an entry with no scope: key at all is reachable by neither leg');
    assert.throws(() => assertWritable(entry), /no-scope-key/);
  });
});

describe('memory scope — the placeholder is rejected at the write boundary (AC-002)', () => {
  it('test_when_scope_empty_and_governs_empty_then_assertWritable_throws_naming_key', async () => {
    const { memDir } = makeProject();
    seedEntry(memDir, 'orphan-fact', { key: 'orphan-fact', scope: '[]' });
    const { assertWritable, UnreachableScopeError } = await loadResolve();
    const entry = entryWith({ key: 'orphan-fact', scope: [], governs: [] });

    assert.throws(
      () => assertWritable(entry),
      (err) => {
        assert.ok(err instanceof UnreachableScopeError, 'the thrown error is the named type, not a bare Error');
        assert.match(err.message, /orphan-fact/, 'the message names the offending entry key so a curator can find it');
        return true;
      },
    );
  });

  it('test_when_scope_is_any_then_assertWritable_throws_naming_any', async () => {
    const { memDir } = makeProject();
    seedEntry(memDir, 'placeholder-fact', { key: 'placeholder-fact', scope: 'any' });
    const { assertWritable } = await loadResolve();
    const entry = entryWith({ key: 'placeholder-fact', scope: 'any', governs: [] });

    assert.throws(
      () => assertWritable(entry),
      (err) => {
        assert.match(err.message, /placeholder-fact/, 'names the entry key');
        assert.match(err.message, /\bany\b/, 'names the placeholder, so the reason is legible without reading the source');
        return true;
      },
    );
  });

  it('test_when_backfillScopeAny_imported_then_export_is_absent', async () => {
    const mod = await loadResolve();

    assert.equal(
      mod.backfillScopeAny,
      undefined,
      'backfillScopeAny is REMOVED, not deprecated — it is the mechanism that stamped all 47 unreachable entries, and a live call site invites the next bulk import to re-create them',
    );
  });
});
