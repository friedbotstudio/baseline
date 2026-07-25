// T2 — hoist a single slug validator (roadmap T2, backlog -9f4f).
// RED until .claude/hooks/lib/slug.mjs exists and the five duplicate SLUG_RE
// definitions are re-pointed at it.
//
// Covers: AC-001 (predicate rejects, never repairs), AC-002 (plan-store re-export
// keeps legacy importers + the T1 length error intact), AC-003 (each call site
// keeps its own failure mode), AC-008 (canonicalSlug is never used as a validator).
//
// The load-bearing rule under test: REJECT, never normalize. A validator that
// "fixes" a hostile slug masks the traversal it exists to catch.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLUG_MODULE = join(REPO_ROOT, '.claude/hooks/lib/slug.mjs');
const PLAN_STORE = join(REPO_ROOT, '.claude/skills/harness/plan-store.mjs');
const AC_CONFORMANCE = join(REPO_ROOT, '.claude/skills/harness/checkers/ac-conformance.mjs');
const CONSOLIDATE_CLI = join(REPO_ROOT, '.claude/skills/harness/consolidate-open-questions.mjs');
const SEED_TASKLIST_CLI = join(REPO_ROOT, '.claude/skills/triage/seed-tasklist.mjs');
const FRAGMENT_WRITER = join(REPO_ROOT, '.claude/skills/whatsnew/fragment-writer.mjs');

const MAX_LEN = 200;
const HOSTILE_SLUGS = ['', '-lead', 'Upper', 'under_score', 'a/b', '../x', '.', 'a b', '../../etc/passwd'];

async function loadSlugModule() {
  try {
    return await import(SLUG_MODULE);
  } catch (err) {
    throw new Error(
      `.claude/hooks/lib/slug.mjs is not importable yet (${err.code || err.message}). `
      + 'The T2 hoist creates it as the single slug predicate.',
    );
  }
}

function runCli(scriptPath, args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
}

function projectRootWithAcConformanceEnabled() {
  const root = mkdtempSync(join(tmpdir(), 'slug-guard-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(
    join(root, '.claude/project.json'),
    JSON.stringify({ velocity: { ac_conformance: { enabled: true } } }),
  );
  return root;
}

describe('AC-001 shared predicate rejects, never repairs', () => {
  it('test_when_slug_is_valid_kebab_then_predicate_accepts', async () => {
    const { isSafeSlug, assertSafeSlug } = await loadSlugModule();
    const good = 'slug-guard-hoist-and-consent-expiry';
    assert.equal(isSafeSlug(good), true);
    assert.equal(assertSafeSlug(good), good);
  });

  it('test_when_slug_is_hostile_then_predicate_rejects_without_repair', async () => {
    const { isSafeSlug, assertSafeSlug } = await loadSlugModule();
    for (const bad of HOSTILE_SLUGS) {
      assert.equal(isSafeSlug(bad), false, `isSafeSlug must reject ${JSON.stringify(bad)}`);
      assert.throws(
        () => assertSafeSlug(bad),
        Error,
        `assertSafeSlug must throw for ${JSON.stringify(bad)}`,
      );
    }
  });

  it('test_when_slug_is_hostile_then_no_repaired_value_is_returned', async () => {
    const { assertSafeSlug } = await loadSlugModule();
    // A normalizer would strip '../' and return 'passwd'. A validator must not.
    try {
      assertSafeSlug('../../etc/passwd');
      assert.fail('expected a throw, not a normalized return value');
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.doesNotMatch(err.message, /^passwd$/, 'must not return a repaired slug');
    }
  });

  it('test_when_slug_is_not_a_string_then_rejected', async () => {
    const { isSafeSlug, assertSafeSlug } = await loadSlugModule();
    for (const bad of [null, undefined, 42, {}, []]) {
      assert.equal(isSafeSlug(bad), false, `isSafeSlug must reject ${JSON.stringify(bad)}`);
      assert.throws(() => assertSafeSlug(bad), Error);
    }
  });

  it('test_when_slug_length_at_and_over_bound_then_boundary_enforced', async () => {
    const { isSafeSlug, assertSafeSlug } = await loadSlugModule();
    const atLimit = 'a'.repeat(MAX_LEN);
    const overLimit = 'a'.repeat(MAX_LEN + 1);
    assert.equal(assertSafeSlug(atLimit), atLimit);
    assert.equal(isSafeSlug(overLimit), false);
    assert.throws(
      () => assertSafeSlug(overLimit),
      (err) => err instanceof Error
        && /length|\b200\b/i.test(err.message)
        && !/ENAMETOOLONG/.test(err.message),
      'expected a named length error, never a raw ENAMETOOLONG',
    );
  });

  it('test_when_module_exports_bounds_then_they_are_the_canonical_values', async () => {
    const { SLUG_RE, MAX_SLUG_LEN } = await loadSlugModule();
    assert.equal(MAX_SLUG_LEN, MAX_LEN);
    assert.equal(String(SLUG_RE), String(/^[a-z0-9][a-z0-9-]*$/));
  });
});

describe('AC-002 plan-store re-export keeps legacy importers intact', () => {
  it('test_when_plan_store_reexports_assert_then_legacy_importers_resolve', async () => {
    const { assertSafeSlug } = await import(PLAN_STORE);
    assert.equal(typeof assertSafeSlug, 'function');
    const good = 'still-works';
    assert.equal(assertSafeSlug(good), good);
  });

  it('test_when_plan_store_assert_throws_then_message_keeps_its_label', async () => {
    const { assertSafeSlug } = await import(PLAN_STORE);
    assert.throws(
      () => assertSafeSlug('../x'),
      (err) => err instanceof Error && /^plan-store:/.test(err.message),
      'plan-store must keep its own error label after the hoist',
    );
  });

  it('test_when_plan_store_length_error_then_T1_assertion_still_holds', async () => {
    const { assertSafeSlug } = await import(PLAN_STORE);
    assert.throws(
      () => assertSafeSlug('a'.repeat(MAX_LEN + 1)),
      (err) => err instanceof Error && /length|\b200\b/i.test(err.message),
      'the T1 length bound must survive the hoist',
    );
  });

  it('test_when_plan_store_consumers_import_then_edges_unbroken', async () => {
    const consumers = [
      '.claude/skills/harness/checker-fanout.mjs',
      '.claude/skills/harness/pre-implementation-gate.mjs',
      '.claude/skills/spec/approval-provenance.mjs',
    ];
    for (const rel of consumers) {
      const mod = await import(join(REPO_ROOT, rel));
      assert.ok(mod, `${rel} must still import cleanly after the hoist`);
    }
  });
});

describe('AC-003 each call site keeps its own failure mode', () => {
  it('test_when_fragment_writer_gets_hostile_slug_then_throws', async () => {
    const { writeFragment } = await import(FRAGMENT_WRITER);
    assert.equal(typeof writeFragment, 'function', 'fragment-writer must export writeFragment');
    const repoRoot = mkdtempSync(join(tmpdir(), 'slug-guard-wn-'));
    await assert.rejects(
      () => writeFragment({
        repoRoot,
        slug: '../../etc/passwd',
        entries: [{ kind: 'added', text: 'x' }],
        now: 1_000_000,
      }),
      Error,
      'fragment-writer must reject a hostile slug before building a path',
    );
  });

  it('test_when_consolidate_cli_gets_hostile_slug_then_stderr_and_nonzero_exit', () => {
    const r = runCli(CONSOLIDATE_CLI, ['--slug', '../../etc/passwd']);
    assert.notEqual(r.status, 0, 'consolidate-open-questions must exit non-zero');
    assert.match(r.stderr, /slug/i, 'must name the slug problem on stderr');
  });

  it('test_when_seed_tasklist_cli_gets_hostile_slug_then_stderr_and_nonzero_exit', () => {
    const r = runCli(SEED_TASKLIST_CLI, ['spec-entry', '../../etc/passwd']);
    assert.notEqual(r.status, 0, 'seed-tasklist must exit non-zero');
    assert.match(r.stderr, /slug/i, 'must name the slug problem on stderr');
  });

  it('test_when_ac_conformance_gets_hostile_slug_then_silent_empty_findings', async () => {
    const { acConformanceAdapter } = await import(AC_CONFORMANCE);
    const rootDir = projectRootWithAcConformanceEnabled();
    const result = await acConformanceAdapter.run({
      rootDir,
      slug: '../../etc/passwd',
      diffContent: 'AC-001',
    });
    assert.deepEqual(result, { findings: [] }, 'ac-conformance must fail open, not throw');
  });
});

describe('AC-008 canonicalSlug is never used as a validator', () => {
  // canonicalSlug is a NORMALIZER. Its legitimate callers derive display/marker
  // slugs; none of the modules below may use it to decide whether a slug is safe.
  const MUST_NOT_IMPORT_CANONICAL_SLUG = [
    '.claude/hooks/lib/slug.mjs',
    '.claude/hooks/lib/timing.mjs',
    '.claude/skills/harness/plan-store.mjs',
    '.claude/skills/harness/consolidate-open-questions.mjs',
    '.claude/skills/harness/checkers/ac-conformance.mjs',
    '.claude/skills/triage/seed-tasklist.mjs',
    '.claude/skills/whatsnew/fragment-writer.mjs',
  ];

  it('test_when_write_set_scanned_then_no_canonical_slug_used_as_validator', () => {
    for (const rel of MUST_NOT_IMPORT_CANONICAL_SLUG) {
      const source = readFileSync(join(REPO_ROOT, rel), 'utf8');
      assert.doesNotMatch(
        source,
        /canonicalSlug/,
        `${rel} must not reference canonicalSlug — it is a normalizer, not a validator`,
      );
    }
  });

  it('test_when_slug_module_scanned_then_it_declares_the_only_regex', () => {
    const source = readFileSync(join(REPO_ROOT, '.claude/hooks/lib/slug.mjs'), 'utf8');
    assert.match(source, /\^\[a-z0-9\]\[a-z0-9-\]\*\$/, 'slug.mjs must own the canonical regex');

    const reDefiners = [
      '.claude/skills/harness/plan-store.mjs',
      '.claude/skills/harness/consolidate-open-questions.mjs',
      '.claude/skills/harness/checkers/ac-conformance.mjs',
      '.claude/skills/triage/seed-tasklist.mjs',
      '.claude/skills/whatsnew/fragment-writer.mjs',
    ];
    for (const rel of reDefiners) {
      const source = readFileSync(join(REPO_ROOT, rel), 'utf8');
      assert.doesNotMatch(
        source,
        /\^\[a-z0-9\]\[a-z0-9-\]\*\$/,
        `${rel} must not redeclare the slug regex — import it from hooks/lib/slug.mjs`,
      );
    }
  });
});
