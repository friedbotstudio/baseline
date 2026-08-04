// Ticket C — edit-time surfacing via the path trigger. Covers AC-001 and AC-007 of
// docs/specs/living-system-model-abcd.md (§Behavior #1), plus the failure modes and
// the regression trap that keeps the existing phase trigger intact.
//
// The root cause (scout): process_lifecycle_guard.mjs:39-49 — PHASE_BY_PREFIX has
// no non-`docs/` entry, so phaseForPath() returns null for every source path and
// the guard emitAllow()s immediately at :49. A Write to a source file therefore
// surfaces nothing BY CONSTRUCTION. Ticket C replaces that early return with a
// fallthrough to a second trigger keyed on `governs:` path globs (epic D3) — NOT a
// 27th hook.
//
// RED until governed-memory.mjs exists and the guard falls through to it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { makeProject, writeShard, writeFlatCategory, tryImport } from './helpers/memory-fixtures.mjs';
import { runPreToolUseHook, writeEditPayload, runTestFile } from './helpers/memory-git-fixtures.mjs';

const GOVERNED_MODULE = '.claude/hooks/lib/governed-memory.mjs';
const GUARD = '.claude/hooks/process_lifecycle_guard.mjs';

function seedGovernedDecision(memDir, slug, governs, extra = {}) {
  return writeShard(memDir, 'decisions', slug, {
    key: slug,
    fields: { governs, load_bearing: 'true', ...extra },
    bodyLines: [`> verbatim: ${slug} governs ${governs}`, '', `Interpretation for ${slug}.`],
  });
}

describe('governed (path-triggered) surfacing (ticket C)', () => {
  it('test_when_editing_path_matching_governs_glob_then_decision_surfaces', async () => {
    const project = makeProject();
    try {
      seedGovernedDecision(project.memDir, 'hooks-are-advisory', '.claude/hooks/**');

      const mod = await tryImport(GOVERNED_MODULE);
      assert.ok(mod, `${GOVERNED_MODULE} must exist`);

      const hits = mod.surfaceGovernedMemory('.claude/hooks/lib/foo.mjs', { rootDir: project.root });
      assert.equal(hits.length, 1, 'the governing decision resolves for a path inside its glob (AC-001)');
      assert.equal(hits[0].key, 'hooks-are-advisory');

      const res = runPreToolUseHook(GUARD, writeEditPayload('.claude/hooks/lib/foo.mjs'), project.root);
      assert.match(
        `${res.stdout}${res.stderr}`,
        /hooks-are-advisory/,
        'the guard surfaces the decision before the write completes — the early emitAllow at :49 must become a fallthrough (AC-001)',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_governs_absent_or_empty_then_no_surfacing', async () => {
    const project = makeProject();
    try {
      writeShard(project.memDir, 'decisions', 'empty-governs', { key: 'empty-governs', fields: { governs: '' } });
      writeShard(project.memDir, 'decisions', 'no-governs-key', { key: 'no-governs-key', fields: {} });

      const mod = await tryImport(GOVERNED_MODULE);
      assert.ok(mod, `${GOVERNED_MODULE} must exist`);

      for (const path of ['.claude/hooks/lib/foo.mjs', 'src/anything.js', 'docs/specs/x.md']) {
        assert.deepEqual(
          mod.surfaceGovernedMemory(path, { rootDir: project.root }),
          [],
          `governs: [] and an absent governs: both mean "governs nothing" — no surfacing for ${path} (AC-001 boundary)`,
        );
      }
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_three_hits_verbatim_but_four_hits_then_summary_with_entry_point', async () => {
    const project = makeProject();
    try {
      const mod = await tryImport(GOVERNED_MODULE);
      assert.ok(mod, `${GOVERNED_MODULE} must exist`);

      for (let i = 1; i <= 3; i++) seedGovernedDecision(project.memDir, `governing-${i}`, 'src/**');
      const three = mod.renderGovernedHits(
        mod.surfaceGovernedMemory('src/a.js', { rootDir: project.root }),
      );
      assert.equal(three.mode, 'verbatim', 'exactly three hits surface verbatim (AC-007)');
      assert.ok(!three.entryPoint, 'the verbatim mode needs no walkable entry point');

      seedGovernedDecision(project.memDir, 'governing-4', 'src/**');
      const four = mod.renderGovernedHits(
        mod.surfaceGovernedMemory('src/a.js', { rootDir: project.root }),
      );
      assert.equal(
        four.mode,
        'summary',
        'above three hits, a summary replaces the bodies — mirrors the existing VERBATIM_LIMIT = 3 idiom at process_lifecycle_guard.mjs:56 (AC-007)',
      );
      assert.ok(
        four.entryPoint,
        'the summary carries a walkable entry point so the reader can still reach the full graph (AC-007)',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_store_unmigrated_then_governed_surface_returns_empty', async () => {
    const project = makeProject();
    try {
      // A fresh consumer install ships a FLAT store. A shard-only reader would
      // silently surface nothing while appearing to work — scoped-memory.mjs:57-61
      // documents exactly this trap.
      writeFlatCategory(project.memDir, 'decisions', [
        { key: 'flat-decision', bodyLines: ['- Decision: written before migration.'] },
      ]);

      const mod = await tryImport(GOVERNED_MODULE);
      assert.ok(mod, `${GOVERNED_MODULE} must exist`);

      assert.deepEqual(
        mod.surfaceGovernedMemory('src/a.js', { rootDir: project.root }),
        [],
        'an unmigrated flat store yields [] rather than throwing (AC-001, AC-011 failure mode)',
      );

      const res = runPreToolUseHook(GUARD, writeEditPayload('src/a.js'), project.root);
      assert.equal(res.status, 0, 'the guard still emits allow on a flat store — it is advisory and fail-open');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_governed_shard_frontmatter_is_corrupt_then_skipped_not_fatal', async () => {
    const project = makeProject();
    try {
      seedGovernedDecision(project.memDir, 'valid-sibling', 'src/**');
      const dir = join(project.memDir, 'decisions');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'corrupt.md'), '---\nkey: [unclosed\ncategory decisions\n', 'utf8');

      const mod = await tryImport(GOVERNED_MODULE);
      assert.ok(mod, `${GOVERNED_MODULE} must exist`);

      let hits;
      assert.doesNotThrow(() => {
        hits = mod.surfaceGovernedMemory('src/a.js', { rootDir: project.root });
      }, 'a malformed shard must not be fatal (AC-001 failure mode)');

      assert.deepEqual(
        hits.map((h) => h.key),
        ['valid-sibling'],
        'the corrupt shard is skipped and its valid sibling still surfaces',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_phase_scoped_surfacing_runs_then_behavior_unchanged', () => {
    // Regression trap. tests/memory-scoped-surface.test.mjs is in the contract's
    // untouched_regression_tests[] — ticket C adds a SECOND trigger and must not
    // disturb the first. Asserted by running that suite, never by editing it.
    const result = runTestFile('tests/memory-scoped-surface.test.mjs');
    assert.ok(
      result.ok,
      `the existing phase-scoped surfacing suite must still pass unmodified — scope: keeps meaning workflow phases and scopedFactsIn stays a membership test.\n${result.stdout}\n${result.stderr}`,
    );
  });
});
