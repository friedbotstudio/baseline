// release-safety-2026-08-25 T1 — AC-001, AC-002, AC-004.
//
// applyDelta calls writeDiagramShard with {kind, rootDir} and nothing else. For an
// element that already has a shard, mergedFields preserves the real label,
// technology and description. For a NEW element there is nothing to preserve, so
// the defaults land — label = elementId, technology = kind, description = null —
// and a null description drops the fourth argument, producing the three-argument
// form the standing corpus guard forbids.
//
// The fold already holds what it needs: the same loop materializes the element
// record, whose `anchor` is the label and whose `title` is the description.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';
import { writeWorkspaceConcept, writeWorkspaceElement, writeWorkspaceShard } from './helpers/workspace-fixtures.mjs';

const DELTA = '.claude/skills/workspace/delta.mjs';
const LIVE_DIAGRAMS = join(REPO_ROOT, 'docs', 'system', 'diagrams');
const LIVE_ELEMENTS = join(REPO_ROOT, 'docs', 'system', 'elements');

// The five shards this batch degraded on 2026-08-24, and the elements they belong to.
const DEGRADED_ON_2026_08_24 = [
  'corpus-reference',
  'plantuml-blocks',
  'spec-lint-checks',
  'state-write-guard',
  'state-write',
];

const FOUR_ARG_RE = /Component\(\s*[a-z0-9_]+\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/;
const THREE_ARG_RE = /Component\([a-z_]+,\s*"[a-z0-9-]+",\s*"c4_[a-z_]+"\)/;

// The flag gate in shards.mjs returns {path:null,written:false} when
// architecture_map is off, so a fixture without it makes every assertion below
// pass vacuously. Every test asserts on written content, which is the tripwire.
// `governed_surface` has no default — resolveGovernedSurface refuses rather than
// guessing — so a fixture omitting it fails inside materialize with an error that
// looks nothing like the behaviour under test.
function seededProject() {
  const root = mkdtempSync(join(tmpdir(), 'deltafold-'));
  mkdirSync(join(root, '.claude', 'hooks'), { recursive: true });
  writeFileSync(
    join(root, '.claude', 'project.json'),
    JSON.stringify({
      memory: {
        architecture_map: {
          enabled: true,
          governed_surface: {
            roots: ['.claude/hooks/'],
            codeExtensions: ['.mjs'],
            alwaysIncluded: [],
            excludedSegments: [],
            excludedTrees: [],
          },
        },
      },
    }),
    'utf8',
  );
  return root;
}

// An anchor only resolves when the file it names exists on the governed surface.
function seedAnchoredFile(root, rel) {
  writeFileSync(join(root, rel), '// fixture\n', 'utf8');
}

function specDirOf(root) {
  const specDir = join(root, 'docs', 'system');
  mkdirSync(specDir, { recursive: true });
  return specDir;
}

function shardTextOf(specDir, id) {
  return readFileSync(join(specDir, 'diagrams', `${id}.puml`), 'utf8');
}

function frontmatterField(text, key) {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(text);
  return match ? match[1].trim() : null;
}

describe('T1 — the fold supplies the element record fields (AC-001)', () => {
  it('test_when_new_element_has_no_shard_then_fold_supplies_anchor_and_title', async () => {
    const mod = await tryImport(DELTA);
    assert.equal(typeof mod?.applyDelta, 'function', 'expected named export `applyDelta`');

    const root = seededProject();
    const specDir = specDirOf(root);
    seedAnchoredFile(root, '.claude/hooks/probe_guard.mjs');
    writeWorkspaceConcept(specDir, 'guard-substrate', { members: [] });
    writeWorkspaceElement(specDir, 'probe-guard', {
      title: 'Probe guard hook',
      anchor: '.claude/hooks/probe_guard.mjs',
    });

    mod.applyDelta({
      confirmed: [{
        elementId: 'probe-guard',
        anchor: '.claude/hooks/probe_guard.mjs',
        concept: 'guard-substrate',
        kind: 'c4_component',
      }],
      specDir,
      rootDir: root,
    });

    const text = shardTextOf(specDir, 'probe-guard');
    const match = FOUR_ARG_RE.exec(text);
    assert.ok(match, `expected a four-argument Component line, got:\n${text}`);
    assert.equal(match[1], '.claude/hooks/probe_guard.mjs', 'label must be the element record anchor');
    assert.equal(match[3], 'Probe guard hook', 'description must be the element record title');
    assert.doesNotMatch(text, THREE_ARG_RE, 'a fresh shard must never render the three-argument form');
  });

  it('test_when_element_record_title_contains_a_double_quote_then_the_write_is_rejected', async () => {
    const mod = await tryImport(DELTA);
    const root = seededProject();
    const specDir = specDirOf(root);
    seedAnchoredFile(root, '.claude/hooks/quoted_guard.mjs');
    writeWorkspaceConcept(specDir, 'guard-substrate', { members: [] });
    writeWorkspaceElement(specDir, 'quoted-guard', {
      title: 'A "quoted" title',
      anchor: '.claude/hooks/quoted_guard.mjs',
    });

    assert.throws(
      () => mod.applyDelta({
        confirmed: [{
          elementId: 'quoted-guard',
          anchor: '.claude/hooks/quoted_guard.mjs',
          concept: 'guard-substrate',
          kind: 'c4_component',
        }],
        specDir,
        rootDir: root,
      }),
      /REJECT, never normalize/,
      'the new field path must not become a hole in the quotedArgument guard',
    );
  });

  // Replaces the recipe's two "record absent" scenarios. `declareAnchor` runs
  // before the shard loop and `materialize` creates the element record from that
  // declaration, so a confirmed row NEVER reaches writeDiagramShard without a
  // record. This asserts the invariant the fix rests on instead of exercising a
  // branch that cannot be reached — see the scenario report's recipe deviation.
  it('test_when_a_row_is_confirmed_then_materialize_guarantees_the_record_the_fold_reads', async () => {
    const mod = await tryImport(DELTA);
    const root = seededProject();
    const specDir = specDirOf(root);
    seedAnchoredFile(root, '.claude/hooks/derived_guard.mjs');
    writeWorkspaceConcept(specDir, 'guard-substrate', { members: [] });

    mod.applyDelta({
      confirmed: [{
        elementId: 'derived-guard',
        anchor: '.claude/hooks/derived_guard.mjs',
        concept: 'guard-substrate',
        kind: 'c4_component',
      }],
      specDir,
      rootDir: root,
    });

    const record = readFileSync(join(specDir, 'elements', 'derived-guard.md'), 'utf8');
    assert.equal(
      frontmatterField(record, 'anchor'),
      '.claude/hooks/derived_guard.mjs',
      'materialize writes the record before the shard loop reads it, so the anchor is always available as the label',
    );
    assert.ok(
      frontmatterField(record, 'title'),
      'materialize writes a title, so the description is always available',
    );
  });
});

describe('T1 — preservation still wins over the new defaults (AC-002)', () => {
  it('test_when_shard_already_exists_then_label_technology_and_description_survive', async () => {
    const mod = await tryImport(DELTA);
    const root = seededProject();
    const specDir = specDirOf(root);
    seedAnchoredFile(root, '.claude/hooks/rich_guard.mjs');
    writeWorkspaceConcept(specDir, 'guard-substrate', { members: [] });
    writeWorkspaceElement(specDir, 'rich-guard', {
      title: 'A title the shard must not adopt',
      anchor: '.claude/hooks/rich_guard.mjs',
    });
    writeWorkspaceShard(specDir, 'rich-guard', {
      lines: [
        "' @kind c4_component",
        'Component(rich_guard, "the/authored/label", "subsystem", "The authored description")',
      ],
    });

    mod.applyDelta({
      confirmed: [{
        elementId: 'rich-guard',
        anchor: '.claude/hooks/rich_guard.mjs',
        concept: 'guard-substrate',
        kind: 'c4_component',
      }],
      specDir,
      rootDir: root,
    });

    const match = FOUR_ARG_RE.exec(shardTextOf(specDir, 'rich-guard'));
    assert.ok(match, 'expected the shard to keep a four-argument Component line');
    assert.equal(match[1], 'the/authored/label', 'an existing label survives the fold');
    assert.equal(match[2], 'subsystem', 'an existing technology survives the fold');
    assert.equal(match[3], 'The authored description', 'an existing description survives the fold');
  });
});

describe('T1 — the five shards degraded on 2026-08-24 are corrected (AC-004)', () => {
  for (const id of DEGRADED_ON_2026_08_24) {
    it(`test_when_${id.replace(/-/g, '_')}_is_read_then_it_carries_its_anchor_and_title`, () => {
      const element = readFileSync(join(LIVE_ELEMENTS, `${id}.md`), 'utf8');
      const shard = readFileSync(join(LIVE_DIAGRAMS, `${id}.puml`), 'utf8');

      const match = FOUR_ARG_RE.exec(shard);
      assert.ok(match, `${id}.puml must carry a four-argument Component line, got:\n${shard}`);
      assert.equal(
        match[1],
        frontmatterField(element, 'anchor'),
        `${id} label must be its element record anchor`,
      );
      assert.equal(
        match[3],
        frontmatterField(element, 'title'),
        `${id} description must be its element record title`,
      );
    });
  }
});
