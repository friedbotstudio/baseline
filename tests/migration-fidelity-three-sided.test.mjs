// shard-migration-repair — AC-006 (three-sided fidelity assertion).
// Covers §Behavior #3.
//
// The original migration asserted only block-count == file-count. Both counts were
// correct while every stamp sat misplaced in a body, so it reported a clean,
// "lossless" migration. The repaired assertion adds three per-entry sides:
//
//   residual-metadata  — an allowlisted bullet left behind in a body (the old bug)
//   dropped-prose      — a non-allowlisted line lost from a body (the NEW bug the
//                        fix could introduce by over-lifting)
//   clobbered-field    — a lift overwrote a pre-existing frontmatter key
//
// clobbered-field is the highest-value assertion here: both original sides were
// body-side, so a frontmatter overwrite passed cleanly AND run two then reported
// `relifted: 0, corpus byte-identical` — green while already corrupted.
//
// RED until: verifyMigrationFidelity accepts per-entry lift results and checks all three.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tryImport } from './helpers/memory-fixtures.mjs';

const MIGRATE_REL = '.claude/skills/memory-index/migrate.mjs';

async function loadMigrate() {
  const mod = await tryImport(MIGRATE_REL);
  assert.ok(mod?.verifyMigrationFidelity, `${MIGRATE_REL} must export verifyMigrationFidelity`);
  return mod;
}

const CLEAN_COUNTS = { decisions: { blocks: 1, files: 1 } };

describe('migration fidelity — three sides (AC-006)', () => {
  it('test_when_allowlisted_bullet_left_in_body_then_residual_metadata_error', async () => {
    const { verifyMigrationFidelity, MigrationFidelityError } = await loadMigrate();
    const perEntry = {
      decisions: [{
        entryKey: 'left-behind',
        residualMetadata: ['- Verified-at: abc1234'],
        droppedProse: [],
        clobberedFields: [],
      }],
    };
    assert.throws(
      () => verifyMigrationFidelity(CLEAN_COUNTS, perEntry),
      (err) => {
        assert.ok(err instanceof MigrationFidelityError);
        assert.match(err.message, /decisions/, 'names the category');
        assert.match(err.message, /left-behind/, 'names the entry key');
        assert.match(err.message, /residual-metadata/, 'names the violated side');
        return true;
      },
    );
  });

  it('test_when_prose_line_dropped_then_dropped_prose_error', async () => {
    const { verifyMigrationFidelity, MigrationFidelityError } = await loadMigrate();
    const perEntry = {
      landmines: [{
        entryKey: 'ate-my-prose',
        residualMetadata: [],
        droppedProse: ['- Trap: the thing that bites'],
        clobberedFields: [],
      }],
    };
    assert.throws(
      () => verifyMigrationFidelity({ landmines: { blocks: 1, files: 1 } }, perEntry),
      (err) => {
        assert.ok(err instanceof MigrationFidelityError);
        assert.match(err.message, /ate-my-prose/);
        assert.match(err.message, /dropped-prose/);
        return true;
      },
    );
  });

  it('test_when_existing_frontmatter_key_overwritten_then_clobbered_field_error', async () => {
    const { verifyMigrationFidelity, MigrationFidelityError } = await loadMigrate();
    const perEntry = {
      decisions: [{
        entryKey: 'pm-mode-engineer-mode-paired-helpers-2026-05-29',
        residualMetadata: [],
        droppedProse: [],
        clobberedFields: [{ field: 'source', from: 'user-instruction', to: 'archived bundle at docs/archive/...' }],
      }],
    };
    assert.throws(
      () => verifyMigrationFidelity(CLEAN_COUNTS, perEntry),
      (err) => {
        assert.ok(err instanceof MigrationFidelityError);
        assert.match(err.message, /pm-mode-engineer-mode-paired-helpers-2026-05-29/);
        assert.match(err.message, /clobbered-field/);
        assert.match(err.message, /source/, 'names the clobbered field');
        return true;
      },
    );
  });

  it('test_when_counts_differ_then_count_error_still_raised', async () => {
    const { verifyMigrationFidelity, MigrationFidelityError } = await loadMigrate();
    assert.throws(
      () => verifyMigrationFidelity({ landmarks: { blocks: 81, files: 80 } }, {}),
      (err) => {
        assert.ok(err instanceof MigrationFidelityError);
        assert.match(err.message, /81|80/, 'reports the mismatched counts');
        return true;
      },
      'the pre-existing count check is additive, not replaced by the three new sides',
    );
  });

  it('test_when_all_sides_clean_then_no_throw', async () => {
    const { verifyMigrationFidelity } = await loadMigrate();
    const perEntry = {
      decisions: [{ entryKey: 'fine', residualMetadata: [], droppedProse: [], clobberedFields: [] }],
    };
    assert.doesNotThrow(() => verifyMigrationFidelity(CLEAN_COUNTS, perEntry));
  });
});
