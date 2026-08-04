// Ticket B — the single canonical-category source. Covers AC-014 of
// docs/specs/living-system-model-abcd.md (§Behavior #4) and the empty-directory
// boundary for AC-010.
//
// The defect this defends against: the canonical list is hardcoded in FOUR places
// today —
//   .claude/hooks/lib/memory_session_start.mjs:16          (CANONICAL)
//   .claude/hooks/lib/scoped-memory.mjs:11                 (CANONICAL_CATEGORIES)
//   .claude/skills/audit-baseline/checks/memory.mjs:10     (CANONICAL, exported)
//   .claude/skills/memory-index/migrate.mjs:36             (map keys)
// Registering an eighth category in one and missing three is a SILENT miss:
// scoped-memory would keep returning [] for every constraint and nothing would
// fail loudly. Decision B2 collapses them onto one import.
//
// RED until categories.mjs exists and all four readers import it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { makeProject, tryImport } from './helpers/memory-fixtures.mjs';

const CATEGORIES_MODULE = '.claude/skills/memory-index/categories.mjs';

const READERS = [
  ['.claude/hooks/lib/memory_session_start.mjs', 'CANONICAL'],
  ['.claude/hooks/lib/scoped-memory.mjs', 'CANONICAL_CATEGORIES'],
  ['.claude/skills/audit-baseline/checks/memory.mjs', 'CANONICAL'],
  ['.claude/skills/memory-index/migrate.mjs', 'CANONICAL'],
];

describe('canonical category registry (ticket B)', () => {
  it('test_when_constraints_registered_once_then_all_four_readers_see_eight_categories', async () => {
    const categories = await tryImport(CATEGORIES_MODULE);
    assert.ok(categories, `${CATEGORIES_MODULE} must exist — it is the single source (decision B2)`);

    assert.equal(
      categories.CANONICAL.length,
      8,
      'the registry carries eight categories once constraints is registered',
    );
    assert.ok(
      categories.CANONICAL.includes('constraints'),
      'constraints is the eighth canonical category',
    );

    for (const [relPath, exportName] of READERS) {
      const mod = await tryImport(relPath);
      assert.ok(mod, `${relPath} must be importable`);

      const list = mod[exportName];
      assert.ok(
        Array.isArray(list),
        `${relPath} must export ${exportName} as an array so the registry is observable`,
      );
      assert.equal(
        list.length,
        8,
        `${relPath} must observe eight categories with no per-reader edit (AC-014)`,
      );
      assert.ok(
        list.includes('constraints'),
        `${relPath} must see constraints via the shared import, not a local literal (AC-014)`,
      );
      assert.deepEqual(
        list,
        categories.CANONICAL,
        `${relPath} must be the SAME list as the registry — a divergent copy is the defect B2 removes`,
      );
    }
  });

  it('test_when_constraints_dir_empty_then_registered_with_zero_entries_no_error', async () => {
    const project = makeProject();
    try {
      mkdirSync(join(project.memDir, 'constraints'), { recursive: true });

      const mod = await tryImport('.claude/hooks/lib/memory_session_start.mjs');
      assert.ok(mod, 'memory_session_start.mjs must be importable');

      let envelope;
      assert.doesNotThrow(() => {
        envelope = mod.buildIndex({
          memDir: project.memDir,
          projectRoot: project.root,
          sessionSource: 'startup',
        });
      }, 'an empty constraints/ directory must not raise in the session index (AC-010 boundary)');

      assert.match(
        String(envelope),
        /constraints/,
        'the registered category appears in the index even with zero entries',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
});
