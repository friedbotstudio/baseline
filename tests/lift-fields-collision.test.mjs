// shard-migration-repair — AC-004 (collision policy: fail loud, never guess).
// Covers §Behavior #2.
//
// Adversarial review found two live entries carrying `source:` in frontmatter AND
// `- Source:` in the body. Lifting the body bullet overwrites the frontmatter key
// (last-key-wins in the parser), and in both cases the frontmatter value is
// `user-instruction` — the value that makes a `verbatim:` blockquote MANDATORY
// under Article IX.6. A silent overwrite therefore destroys the provenance that
// makes the verbatim gate apply, and the body-side fidelity checks cannot see it.
//
// The two values mean genuinely different things (a provenance CATEGORY vs a
// POINTER to an archive), so no mechanical rule picks correctly. REJECT, never
// normalize — the same doctrine assertSafeSlug already carries in this repo.
//
// RED until: liftFields reports collisions and reliftShards refuses those entries.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tryImport, copyLiveCorpus, writeShard } from './helpers/memory-fixtures.mjs';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const LIFT_FIELDS_REL = '.claude/skills/memory-index/lift-fields.mjs';
const MIGRATE_REL = '.claude/skills/memory-index/migrate.mjs';

const KNOWN_COLLISIONS = [
  'pm-mode-engineer-mode-paired-helpers-2026-05-29',
  'tier-dial-oracle-floors-2026-06-16',
];

async function loadLifter() {
  const mod = await tryImport(LIFT_FIELDS_REL);
  assert.ok(mod, `${LIFT_FIELDS_REL} must exist and be importable`);
  return mod;
}

function freshMemDir(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const memDir = join(root, '.claude', 'memory');
  mkdirSync(memDir, { recursive: true });
  return { root, memDir };
}

describe('lift-fields — collision policy (AC-004)', () => {
  it('test_when_body_field_equals_existing_frontmatter_then_dedup_no_refusal', async () => {
    const { liftFields } = await loadLifter();
    const result = liftFields('- Source: incident\n- Trap: still bites\n', { source: 'incident' });
    assert.deepEqual(result.collisions ?? [], [], 'identical values are not a conflict');
    assert.deepEqual(
      Object.fromEntries(result.fields), {},
      'the body bullet is dropped as a duplicate rather than re-lifted over an identical key',
    );
    assert.equal(result.bodyLines.join('\n'), '- Trap: still bites');
  });

  it('test_when_body_field_differs_from_existing_frontmatter_then_refused', async () => {
    const { liftFields } = await loadLifter();
    const { root, memDir } = freshMemDir('collide-');
    try {
      const path = writeShard(memDir, 'decisions', 'conflicting-entry', {
        key: 'conflicting-entry',
        fields: { source: 'user-instruction' },
        bodyLines: ['- Source: archived bundle at docs/archive/2026-05-29/x/'],
      });
      const before = readFileSync(path, 'utf8');

      const result = liftFields(
        '- Source: archived bundle at docs/archive/2026-05-29/x/\n',
        { source: 'user-instruction' },
      );
      assert.equal(result.collisions.length, 1, 'a differing value is a collision');
      const [c] = result.collisions;
      assert.equal(c.field, 'source');
      assert.equal(c.frontmatterValue, 'user-instruction');
      assert.equal(c.bodyValue, 'archived bundle at docs/archive/2026-05-29/x/');

      const migrate = await tryImport(MIGRATE_REL);
      assert.ok(migrate?.reliftShards, 'migrate.mjs must export reliftShards');
      const report = migrate.reliftShards(memDir);
      assert.equal(report.refused, 1, 'the colliding entry is refused, not written');
      assert.equal(readFileSync(path, 'utf8'), before, 'refused entry is byte-identical on disk');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // The two historical collisions (KNOWN_COLLISIONS) were resolved by renaming the
  // body bullet `- Source:` -> `- Archive:` in each entry: the frontmatter value is
  // a provenance CATEGORY from the README's closed enum, the body value is a
  // POINTER to an archive bundle. Two different fields that had collided on one
  // name. The frontmatter `source: user-instruction` was left intact, so the
  // Article IX.6 verbatim obligation on both entries still applies.
  //
  // This now guards the invariant rather than the incident: the live corpus must
  // relift with zero refusals. Reintroducing a colliding metadata-named bullet
  // fails here. Detection itself is covered by the crafted-fixture test above.
  it('test_when_live_corpus_relifted_then_no_collisions_remain', async () => {
    const migrate = await tryImport(MIGRATE_REL);
    assert.ok(migrate?.reliftShards, 'migrate.mjs must export reliftShards');
    const { root, memDir } = copyLiveCorpus('collide-live-');
    try {
      const report = migrate.reliftShards(memDir);
      assert.deepEqual(report.collisions ?? [], [],
        'the live corpus relifts cleanly; a new colliding bullet would surface here');
      assert.equal(report.refused, 0, 'no entry is refused');

      for (const key of KNOWN_COLLISIONS) {
        const file = join(memDir, 'decisions', `${key}.md`);
        const text = readFileSync(file, 'utf8');
        assert.match(text, /^source: user-instruction/m,
          `${key} keeps its frontmatter provenance — the Art. IX.6 verbatim obligation depends on it`);
        assert.match(text, /^- Archive: /m, `${key} keeps its archive pointer under a non-colliding name`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
