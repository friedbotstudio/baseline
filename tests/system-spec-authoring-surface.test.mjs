// central-system-spec slice B — the authoring surface leaves shipped code (AC-010, AC-011, AC-012).
//
// Two things move out of .claude/skills/workspace/seed-map.mjs, a baseline-owned
// manifest-hashed file a consumer cannot edit without tripping Article XII:
//   - GOVERNED_SURFACE  -> project.json, so a project declares its own roots
//   - CONCEPT_ANCHORS   -> one authored file per concept under <specDir>/concepts/
//
// Element ids stop being authored and start deriving from the anchor, which is what
// lets two branches materialize the same anchor into the same filename instead of
// two records that conflicts.duplicateAnchor then rejects.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SLUG_RE } from '../.claude/hooks/lib/slug.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function tryImport(rel) {
  try {
    return await import(resolve(REPO_ROOT, rel));
  } catch {
    return null;
  }
}

const SURFACE = {
  roots: ['lib/'],
  codeExtensions: ['.mjs'],
  alwaysIncluded: [],
  excludedSegments: ['fixtures/'],
  excludedTrees: ['lib/vendor/'],
};

function writeProject(root, governedSurface) {
  const config = { memory: { architecture_map: { enabled: true } } };
  if (governedSurface !== undefined) config.memory.architecture_map.governed_surface = governedSurface;
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude', 'project.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

// A governed tree with real files: materialize refuses an anchor that resolves to
// nothing, so records alone are not enough to exercise it.
function makeGovernedProject(governedSurface = SURFACE) {
  const root = mkdtempSync(join(tmpdir(), 'authoring-'));
  writeProject(root, governedSurface);
  mkdirSync(join(root, 'lib'), { recursive: true });
  for (const name of ['alpha.mjs', 'beta.mjs', 'shared.mjs']) {
    writeFileSync(join(root, 'lib', name), `export const ${name.replace('.mjs', '')} = 1;\n`, 'utf8');
  }
  const specDir = join(root, 'docs', 'system');
  mkdirSync(join(specDir, 'concepts'), { recursive: true });
  mkdirSync(join(specDir, 'elements'), { recursive: true });
  return { root, specDir };
}

function writeConceptFile(specDir, id, { title = id, anchors = [] } = {}) {
  const preamble = [`id: ${id}`, 'kind: concept', `title: ${title}`, `anchors: ${anchors.join(',')}`];
  writeFileSync(join(specDir, 'concepts', `${id}.md`), `---\n${preamble.join('\n')}\n---\n\nbody\n`, 'utf8');
}

describe('B — the governed surface and the concept map leave shipped code', () => {
  it('test_when_governed_surface_config_absent_then_named_error_not_fallback', async () => {
    const surface = await tryImport('.claude/skills/workspace/surface.mjs');
    assert.ok(surface, '.claude/skills/workspace/surface.mjs does not exist yet');

    for (const [label, value] of [['absent', undefined], ['null', null], ['wrong type', 'lib/']]) {
      const root = mkdtempSync(join(tmpdir(), 'authoring-bad-'));
      writeProject(root, value);
      assert.throws(
        () => surface.resolveGovernedSurface({ rootDir: root }),
        /memory\.architecture_map\.governed_surface/,
        `a ${label} governed surface must throw an error naming the config key`,
      );
    }

    // REJECT, never guess (D6): baseline's own roots must never leak in as a default.
    const root = mkdtempSync(join(tmpdir(), 'authoring-bad-'));
    writeProject(root, undefined);
    let message = '';
    try {
      surface.resolveGovernedSurface({ rootDir: root });
    } catch (err) {
      message = String(err.message);
    }
    assert.doesNotMatch(message, /\.claude\/hooks\//,
      'the error must not hint at a baseline default; there is no fallback surface');

    const good = mkdtempSync(join(tmpdir(), 'authoring-ok-'));
    writeProject(good, SURFACE);
    assert.deepEqual(surface.resolveGovernedSurface({ rootDir: good }), SURFACE,
      'a declared surface resolves to exactly what the project declared');
  });

  it('test_when_concepts_authored_per_file_then_materialize_derives_elements', async () => {
    const materialize = await tryImport('.claude/skills/workspace/materialize.mjs');
    const identity = await tryImport('.claude/skills/workspace/identity.mjs');
    const store = await tryImport('.claude/skills/workspace/store.mjs');
    assert.ok(materialize && identity && store, 'materialize, identity and store must be importable');

    const { root, specDir } = makeGovernedProject();
    writeConceptFile(specDir, 'concept-one', { anchors: ['lib/alpha.mjs', 'lib/shared.mjs'] });
    writeConceptFile(specDir, 'concept-two', { anchors: ['lib/beta.mjs', 'lib/shared.mjs'] });

    const result = materialize.materialize({ specDir, rootDir: root });
    assert.equal(result.elements, 3, 'three distinct anchors yield three elements, not four declarations');
    assert.equal(result.concepts, 2);

    const { elements } = store.readAll(specDir);
    const byAnchor = new Map(elements.map((el) => [el.anchor, el]));
    assert.deepEqual([...byAnchor.keys()].sort(), ['lib/alpha.mjs', 'lib/beta.mjs', 'lib/shared.mjs']);

    // D6: one anchor declared by two concepts is ONE element in two concepts.
    const shared = byAnchor.get('lib/shared.mjs');
    const concepts = await tryImport('.claude/skills/workspace/concepts.mjs');
    const membership = concepts.readConcepts(specDir)
      .filter((c) => c.members.includes(shared.id))
      .map((c) => c.id)
      .sort();
    assert.deepEqual(membership, ['concept-one', 'concept-two'],
      'an anchor declared twice must produce one element belonging to both concepts');

    assert.ok(!existsSync(resolve(REPO_ROOT, '.claude/skills/workspace/seed-map.mjs')),
      'seed-map.mjs must be gone: a hand-edited shipped file is what a consumer cannot own');
  });

  it('test_when_same_anchor_materialized_on_two_branches_then_identical_id', async () => {
    const identity = await tryImport('.claude/skills/workspace/identity.mjs');
    assert.ok(identity, '.claude/skills/workspace/identity.mjs does not exist yet');
    const { deriveId } = identity;

    const anchors = [
      '.claude/hooks/lib/memory_session_start.mjs',
      '.claude/skills/**',
      'lib/a.mjs',
      `deep/${'nested/'.repeat(40)}leaf.mjs`,
    ];

    for (const anchor of anchors) {
      const first = deriveId(anchor);
      const second = deriveId(anchor);
      assert.equal(first, second, `deriveId must be pure: ${anchor} gave two answers`);
      assert.match(first, SLUG_RE, `${anchor} must derive a slug-safe id, got ${JSON.stringify(first)}`);
      assert.ok(first.length <= 200, `${anchor} derived an over-long id (${first.length} > 200)`);
    }

    const ids = anchors.map(deriveId);
    assert.equal(new Set(ids).size, anchors.length, 'distinct anchors must not collide');
  });
});
