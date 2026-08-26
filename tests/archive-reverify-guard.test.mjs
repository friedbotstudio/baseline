// Ticket velocity-envelope-derives, second slice — closing the post-archive gap.
//
// `/integrate` stamps the binding PASS at Phase 9. `/archive` then writes the
// workflow's own bundle at Phase 10.5, and `/commit` stages it. Nothing re-runs
// the suite between the two, so a workflow can commit a tree its binding verdict
// never saw. Measured 2026-08-26: the `discard-ledger-audit-allowance` bundle
// re-fitted the tdd-quickfix envelope from 39,105 to 38,227 and turned CI red on
// the commit that had just landed.
//
// Re-running the whole suite at every archive closes that and costs ~5 minutes
// per workflow. This guard decides which case it is, and errs toward re-running.
//
// WHAT THE DIGEST COVERS, and why it is exactly these three things. The first
// version hashed every file in every bundle. That is safe and useless: a bundle
// always carries a fresh workflow.json and timing.md, so the digest always moved
// and the guard re-ran every time. The set below was measured instead of guessed,
// by finding what actually reads the live archive:
//
//   - the per-track FITTED ENVELOPE, because `envelopeFor` is what re-fitted and
//     broke CI. A bundle that is not yet `measured` moves no envelope.
//   - every `spec.md` path and its content. `drift-check-contracts.test.mjs:271`
//     sweeps all of them, and `spec-drift-repair.test.mjs:28` resolves one by
//     walking date directories. A `tdd-quickfix` bundle carries no spec.md.
//   - the set of distinct FILENAMES, because a bundle carrying an artifact type
//     no bundle carried before is a shape change.
//
// It deliberately does NOT cover the bundle count, their paths, or the bytes of
// files nothing reads. Those move on every archive, and including them is what
// made the first version a skip mechanism that never skipped.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GUARD = '../.claude/skills/archive/reverify-guard.mjs';

function makeTree() {
  const root = mkdtempSync(join(tmpdir(), 'archive-reverify-'));
  mkdirSync(join(root, 'docs', 'archive'), { recursive: true });
  return root;
}

// A bundle of the shape /archive actually produces: a track in workflow.json and
// a rendered timing table. `measured` is the word `parseTable` keys on, so an
// unmeasured bundle is one whose table has no token column yet.
function addBundle(root, date, slug, { track = 'tdd-quickfix', measured = false, extra = {} } = {}) {
  const dir = join(root, 'docs', 'archive', date, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'workflow.json'), JSON.stringify({ slug, track_id: track }), 'utf8');
  const table = measured
    ? '# timing\n\n| Phase | Tokens (out) | Model s | Human s |\n|---|---|---|---|\n| tdd | 9000 | 1 | 1 |\n'
    : `# timing\n\n(no measurement for ${slug})\n`;
  writeFileSync(join(dir, 'timing.md'), table, 'utf8');
  for (const [name, body] of Object.entries(extra)) writeFileSync(join(dir, name), body, 'utf8');
  return dir;
}

describe('archive re-verify guard — the skip is earned, never assumed', () => {
  it('test_when_nothing_moved_then_the_digest_is_stable', async () => {
    const mod = await import(GUARD);
    const root = makeTree();
    try {
      addBundle(root, '2026-08-01', 'alpha');

      assert.equal(
        mod.corpusDigest({ rootDir: root }),
        mod.corpusDigest({ rootDir: root }),
        'the digest must be deterministic, or every archive re-runs for no reason',
      );
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_a_bundle_of_a_known_shape_is_added_then_the_digest_holds', async () => {
    const mod = await import(GUARD);
    const root = makeTree();
    try {
      addBundle(root, '2026-08-01', 'alpha');
      const before = mod.corpusDigest({ rootDir: root });

      // Its own slug, its own date, its own file contents — and still nothing any
      // check reads. This is the ordinary tdd-quickfix landing, and it is the case
      // that makes the guard worth having.
      addBundle(root, '2026-08-02', 'beta');

      assert.equal(
        mod.corpusDigest({ rootDir: root }), before,
        'an unmeasured bundle with no spec.md moves no envelope, no archived spec and no artifact type; re-running the suite for it is the ~5 minutes this exists to save',
      );
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_a_bundle_carries_a_new_artifact_type_then_the_digest_moves', async () => {
    const mod = await import(GUARD);
    const root = makeTree();
    try {
      addBundle(root, '2026-08-01', 'alpha');
      const before = mod.corpusDigest({ rootDir: root });

      addBundle(root, '2026-08-02', 'beta', { extra: { 'spec.approved': 'token\n' } });

      assert.notEqual(
        mod.corpusDigest({ rootDir: root }), before,
        'a filename no bundle carried before is a shape change, and the tree-reading checks assert on shape',
      );
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_a_bundles_measured_payload_changes_then_the_digest_moves', async () => {
    const mod = await import(GUARD);
    const root = makeTree();
    try {
      // Five is MIN_FIT_SAMPLES, so the envelope only becomes fitted at the fifth.
      for (let i = 0; i < 5; i += 1) addBundle(root, '2026-08-01', `m${i}`, { measured: true });
      const before = mod.corpusDigest({ rootDir: root });

      addBundle(root, '2026-08-02', 'sixth', { measured: true });

      assert.notEqual(
        mod.corpusDigest({ rootDir: root }), before,
        'a measured bundle re-fits the envelope, which is the input that turned CI red; a digest blind to it would skip the one run that mattered',
      );
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_a_bundle_carries_an_archived_spec_then_the_digest_moves', async () => {
    const mod = await import(GUARD);
    const root = makeTree();
    try {
      addBundle(root, '2026-08-01', 'alpha');
      const before = mod.corpusDigest({ rootDir: root });

      addBundle(root, '2026-08-02', 'beta', { extra: { 'spec.md': '# spec\n' } });

      assert.notEqual(
        mod.corpusDigest({ rootDir: root }), before,
        'drift-check-contracts sweeps every archived spec.md and spec-drift-repair resolves one by walking date directories; both read a set this bundle just changed',
      );
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_an_archived_specs_content_changes_then_the_digest_moves', async () => {
    const mod = await import(GUARD);
    const root = makeTree();
    try {
      const dir = addBundle(root, '2026-08-01', 'alpha', { extra: { 'spec.md': '# spec\n' } });
      const before = mod.corpusDigest({ rootDir: root });

      writeFileSync(join(dir, 'spec.md'), '# spec\n\nnow says something else\n', 'utf8');

      assert.notEqual(
        mod.corpusDigest({ rootDir: root }), before,
        'the sweep scores each archived spec, so its CONTENT is read and not merely its presence',
      );
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('archive re-verify guard — every unknown re-verifies', () => {
  it('test_when_no_snapshot_was_captured_then_it_re_verifies', async () => {
    const mod = await import(GUARD);
    const root = makeTree();
    try {
      const verdict = mod.decide({ rootDir: root, slug: 'never-captured' });

      assert.equal(verdict.exitCode, 0, 'an absent snapshot is doubt, and doubt re-runs');
      assert.equal(verdict.verdict, 're-verify');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_the_snapshot_matches_then_it_skips', async () => {
    const mod = await import(GUARD);
    const root = makeTree();
    try {
      addBundle(root, '2026-08-01', 'alpha');
      mod.capture({ rootDir: root, slug: 'demo' });
      addBundle(root, '2026-08-02', 'beta');

      const verdict = mod.decide({ rootDir: root, slug: 'demo' });

      assert.equal(verdict.exitCode, 3, 'a provable match is the only thing that yields a skip');
      assert.equal(verdict.verdict, 'skip');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_the_snapshot_is_unreadable_then_it_re_verifies', async () => {
    const mod = await import(GUARD);
    const root = makeTree();
    try {
      mod.capture({ rootDir: root, slug: 'demo' });
      writeFileSync(join(root, '.claude/state/archive-reverify/demo.json'), '{ not json', 'utf8');

      const verdict = mod.decide({ rootDir: root, slug: 'demo' });

      assert.equal(verdict.exitCode, 0, 'a corrupt snapshot must never be read as a match');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_the_slug_is_unsafe_then_no_path_is_built', async () => {
    const mod = await import(GUARD);
    const root = makeTree();
    try {
      assert.throws(
        () => mod.capture({ rootDir: root, slug: '../../etc/passwd' }),
        /slug/i,
        'the slug reaches a filesystem path, so it is validated before the path is constructed (CWE-22), rejected rather than normalized',
      );
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// The guard is only worth having if /archive calls it. `document-gate.mjs` shipped
// with no producer, `flags.mjs` shipped with no consumer, and `reconcile.mjs` and
// `placement.mjs` shipped with no caller — four in one session, all green, all
// inert. Prose in a SKILL.md cannot fail a build, so this asserts the wiring.
describe('archive re-verify guard — the SOP calls it', () => {
  it('test_when_the_archive_sop_is_read_then_it_captures_before_and_checks_after', async () => {
    const { readFileSync: read } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
    const sop = read(join(repoRoot, '.claude/skills/archive/SKILL.md'), 'utf8');

    const capture = sop.indexOf('reverify-guard.mjs capture');
    const check = sop.indexOf('reverify-guard.mjs check');
    const move = sop.indexOf('.claude/skills/archive/archive.sh <slug>');

    assert.ok(capture > 0, 'the SOP must invoke `capture`, or there is no pre-archive state to compare against');
    assert.ok(check > 0, 'the SOP must invoke `check`, or the guard never runs and the gap it closes stays open');
    assert.ok(
      capture < move,
      'capture must precede the move — after it, the pre-archive corpus is gone and every run re-verifies',
    );
    assert.ok(
      move < check,
      'check must follow the move, since the whole question is what the move changed',
    );
  });

  it('test_when_the_guard_ships_then_the_manifest_carries_it', async () => {
    const { readFileSync: read, existsSync: exists } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
    const manifestPath = join(repoRoot, 'obj/template/.claude/manifest.json');
    if (!exists(manifestPath)) {
      assert.ok(true, 'obj/ is build output; run `npm run build` first');
      return;
    }

    const manifest = JSON.parse(read(manifestPath, 'utf8'));

    for (const rel of [
      '.claude/skills/archive/reverify-guard.mjs',
      '.claude/skills/archive/corpus-digest.mjs',
    ]) {
      assert.ok(
        manifest.files[rel],
        `a consumer install runs the same archive SOP, so ${rel} has to be in the shipped manifest — the guard imports it, and a SOP naming a file the install does not have fails at the moment it is followed`,
      );
    }
  });
});

// The digest models three things and omits bundle count and bundle paths, because
// nothing asserts on them TODAY. That is an assumption about the rest of the
// suite, not a property of this module, so it is pinned here rather than written
// down somewhere. A check that starts reading the live archive some other way is
// invisible to the guard, and the guard would then skip a run that mattered.
//
// Both declared readers were found by measurement, and both are covered: they
// consume archived `spec.md` files, which the digest hashes by path and content.
describe('archive re-verify guard — the assumption it rests on', () => {
  const DECLARED = new Set([
    // sweeps every archived spec.md and scores each against its landing commit
    'drift-check-contracts.test.mjs',
    'spec-drift-repair.test.mjs',
    // resolves one named slug's spec.md by walking date directories newest-first

  ]);

  it('test_when_a_test_reads_the_live_archive_then_it_is_a_declared_reader', async () => {
    const { readdirSync: readDir, readFileSync: read } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const testsDir = fileURLToPath(new URL('.', import.meta.url));

    const undeclared = [];
    for (const name of readDir(testsDir).filter((n) => n.endsWith('.test.mjs'))) {
      if (DECLARED.has(name) || name === 'archive-reverify-guard.test.mjs') continue;
      const src = read(join(testsDir, name), 'utf8');
      // Resolving the repo root and joining docs/archive is what "reads the LIVE
      // tree" looks like. A fixture builds its path from a tmpdir instead, so this
      // does not fire on the many suites that archive into a sandbox.
      if (/(REPO_ROOT|repoRoot|process\.cwd\(\))[^\n]*docs\/archive/.test(src)) undeclared.push(name);
    }

    assert.deepEqual(
      undeclared,
      [],
      'this file reads the live archive tree, so the post-archive guard has to model what it reads before it may skip a re-verify. Check whether it depends on bundle count or bundle paths — neither is in the digest — then either widen `corpus-digest.mjs` or add the file to DECLARED with a note saying what it consumes',
    );
  });
});
