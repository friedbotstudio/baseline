// system-spec-delta slice D — the kind-annotation backfill across every shard in
// docs/system/diagrams/.
//
// Covers AC-010: every shard on disk carries a kind annotation, and
// `witness.bindingFor` returns a binding other than `witness: none` for every
// element. Plus the §Test plan regression trap — the `elementIdFromSection` join
// stays total both ways.
//
// Two levels deliberately:
//   - the LIVE corpus is asserted directly, because AC-010 quantifies over what is
//     actually on disk. A tmpdir fixture would prove the writer works and say
//     nothing about whether the backfill ran;
//   - the WRITER extension the backfill needs (a C4 technology slot distinct from
//     the diagram kind, plus a description) is exercised over tmpdir corpora, where
//     a hostile value can be thrown at it without touching docs/system/.
//
// Slice D is a DATA backfill against an already-correct reader. This file asserts
// nothing about the KIND regex, `readShard`, `bindingFor` or `findMissingKind` —
// changing any of them would be the wrong fix for a red test here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { makeProject, tryImport, REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { makeWorkspace } from './helpers/workspace-fixtures.mjs';

const SHARDS = '.claude/skills/workspace/shards.mjs';
const WITNESS = '.claude/skills/workspace/witness.mjs';
const REPORT = '.claude/skills/system-reconcile/reconcile-report.mjs';

const LIVE_SPEC_DIR = join(REPO_ROOT, 'docs', 'system');
const LIVE_DIAGRAMS = join(LIVE_SPEC_DIR, 'diagrams');
const LIVE_ELEMENTS = join(LIVE_SPEC_DIR, 'elements');

// ─── Foundation: the live corpus, and a flagged throwaway to write into ───

// A shard's model line. The optional fourth group is C4's `descr` argument, which
// 112 of the live shards carry and the writer did not emit before this slice.
const COMPONENT = /^Component\(([A-Za-z0-9_]+),\s*"([^"]*)",\s*"([^"]*)"(?:,\s*"([^"]*)")?\)\s*$/m;
const KIND_LINE = /^'\s*@kind\s+([A-Za-z0-9_-]+)\s*$/m;

function liveShardFiles() {
  return readdirSync(LIVE_DIAGRAMS).filter((name) => name.endsWith('.puml')).sort();
}

function liveElementIds() {
  return readdirSync(LIVE_ELEMENTS).filter((name) => name.endsWith('.md')).map((name) => name.replace(/\.md$/, '')).sort();
}

function readLiveShard(file) {
  return readFileSync(join(LIVE_DIAGRAMS, file), 'utf8');
}

// An absent diagrams/ is the CLEANEST form of "no partial shard was left behind":
// `makeWorkspace` creates only elements/, and the directory is conjured by the first
// successful write. A bare readdirSync would throw ENOENT there and report a
// correctly-rejected field as a test error.
function listDiagrams(specDir) {
  try {
    return readdirSync(join(specDir, 'diagrams')).sort();
  } catch {
    return [];
  }
}

// The arguments a shard declares, in the writer's own vocabulary. `label` is C4's
// second argument, `technology` its third and `description` its optional fourth —
// deliberately NOT called `kind`, because the whole point of this slice is that the
// diagram kind is a separate annotation and not the technology slot.
function parseComponent(text) {
  const match = COMPONENT.exec(text);
  if (!match) return null;
  const [, section, label, technology, description] = match;
  return { section, label, technology, description: description ?? null };
}

// A throwaway project with the architecture-map flag ON and the same witness
// registry shape the live project uses, so the writer is live and `bindingFor`
// resolves against a real registry rather than an empty one.
function flaggedCorpus() {
  const project = makeProject();
  mkdirSync(join(project.root, '.claude'), { recursive: true });
  writeFileSync(join(project.root, '.claude', 'project.json'), JSON.stringify({
    memory: {
      architecture_map: {
        enabled: true,
        governed_surface: { roots: ['src/'], codeExtensions: ['.mjs'], alwaysIncluded: [], excludedSegments: [], excludedTrees: [] },
        witnesses: { c4_component: { witness: 'anchor-digest' }, sequence: { witness: 'test' } },
      },
    },
  }), 'utf8');
  makeWorkspace(project.specDir);
  return project;
}

async function loadWriter() {
  const shards = await tryImport(SHARDS);
  assert.ok(shards?.writeDiagramShard, `${SHARDS} does not export writeDiagramShard yet`);
  return shards;
}

async function loadWitness() {
  const witness = await tryImport(WITNESS);
  assert.ok(witness?.bindingFor, `${WITNESS} does not export bindingFor yet`);
  return witness;
}

// ─── AC-010 — the corpus after the backfill ───

describe('AC-010 — every shard carries a witness kind', () => {
  it('test_when_corpus_scanned_then_every_shard_carries_a_kind_annotation', async () => {
    const shards = await loadWriter();
    const files = liveShardFiles();
    assert.ok(files.length > 0, 'the live corpus must hold shards for this assertion to mean anything');

    const unannotated = [];
    const unparsed = [];
    for (const file of files) {
      const id = file.replace(/\.puml$/, '');
      const shard = shards.readShard(LIVE_SPEC_DIR, id);
      if (shard === null) unparsed.push(file);
      else if (!shard.kind) unannotated.push(file);
    }

    // Named, not counted. The spec's sanctioned shortfall is a shard whose kind is
    // genuinely ambiguous, and an operator can only judge that from the file list.
    assert.deepEqual(unparsed, [], 'every file in diagrams/ must parse as a shard');
    assert.deepEqual(unannotated, [],
      `every shard must carry a kind annotation; unannotated: ${unannotated.join(', ')}`);
  });

  it('test_when_every_element_bound_then_none_binds_witness_none', async () => {
    const shards = await loadWriter();
    const witness = await loadWitness();

    const unwitnessed = [];
    for (const id of liveElementIds()) {
      const shard = shards.readShard(LIVE_SPEC_DIR, id);
      assert.ok(shard, `element ${id} must have a readable shard before it can be witnessed`);
      const binding = witness.bindingFor(shard.kind, { rootDir: REPO_ROOT });
      if (binding.witness === 'none') unwitnessed.push(`${id} (kind ${shard.kind})`);
    }

    // An unregistered kind binds `none` rather than throwing, so a backfill that
    // invented a kind outside the registry would leave the block inert and silent.
    // This is the assertion that catches it.
    assert.deepEqual(unwitnessed, [],
      `every element must bind a real witness; unwitnessed: ${unwitnessed.join(', ')}`);
  });

  it('test_when_join_walked_both_ways_then_it_stays_total', async () => {
    const shards = await loadWriter();
    const report = await tryImport(REPORT);
    assert.ok(report?.runReconcile, `${REPORT} does not export runReconcile yet`);

    // Driven through the shipped report rather than a private walk, so this test
    // and `/system-reconcile` can never disagree about one corpus.
    const health = report.runReconcile({ specDir: LIVE_SPEC_DIR, rootDir: REPO_ROOT });
    assert.deepEqual(health.missingKind, [], 'no element may be left without a kind annotation');
    assert.deepEqual(health.orphanShards, [], 'no shard section may name an element that does not exist');
    assert.deepEqual(health.unillustrated, [], 'no element may be left without a shard');

    // The file-side half of the join: every section maps back to a real element id.
    const ids = new Set(liveElementIds());
    const dangling = shards.everyShardSection(LIVE_SPEC_DIR)
      .map(({ file, section }) => ({ file, id: shards.elementIdFromSection(section) }))
      .filter(({ id }) => !ids.has(id));
    assert.deepEqual(dangling, [], 'elementIdFromSection must land on a real element for every shard');
  });
});

// ─── The writer extension the backfill needs ───

describe('AC-010 — the writer preserves what the corpus already declares', () => {
  it('test_when_shard_carries_a_description_then_the_component_keeps_four_arguments', async () => {
    const shards = await loadWriter();
    const { root, specDir } = flaggedCorpus();

    shards.writeDiagramShard(specDir, 'foo-guard', {
      kind: 'c4_component',
      technology: 'subsystem',
      description: 'Foo subsystem',
      label: '.claude/skills/foo/*.mjs',
      rootDir: root,
    });

    const text = readFileSync(join(specDir, 'diagrams/foo-guard.puml'), 'utf8');
    const parsed = parseComponent(text);
    assert.ok(parsed, 'the written shard must declare a parseable Component line');

    // 51 live shards declare `subsystem` in C4's technology slot while their element
    // record reads `kind: component`. That distinction exists nowhere else on disk,
    // so a writer that folds the diagram kind into the technology slot erases it.
    assert.equal(parsed.label, '.claude/skills/foo/*.mjs');
    assert.equal(parsed.technology, 'subsystem', 'the technology slot must carry what the caller named, not the kind');
    assert.equal(parsed.description, 'Foo subsystem', 'the description must survive as C4 argument four');

    // The diagram kind stays an annotation, on its own line, INSIDE the block (D3).
    assert.equal(shards.readShard(specDir, 'foo-guard').kind, 'c4_component');
    const lines = text.split('\n');
    const startAt = lines.findIndex((line) => line.startsWith('!startsub'));
    const endAt = lines.findIndex((line) => line.startsWith('!endsub'));
    const kindAt = lines.findIndex((line) => KIND_LINE.test(line));
    assert.ok(startAt >= 0 && endAt > startAt, 'the shard must be a complete !startsub/!endsub block');
    assert.ok(kindAt > startAt && kindAt < endAt, 'the kind annotation must sit INSIDE the block (D3)');
  });

  it('test_when_technology_and_description_omitted_then_slice_b_output_is_unchanged', async () => {
    const shards = await loadWriter();
    const { root, specDir } = flaggedCorpus();

    shards.writeDiagramShard(specDir, 'bar', { kind: 'c4_component', label: 'Bar', rootDir: root });

    // Byte-exact, not shape-approximate: the two shards slice B already wrote to the
    // live corpus must stay reproducible by this writer, or the next real write
    // rewrites them and the diff blames slice D.
    assert.equal(
      readFileSync(join(specDir, 'diagrams/bar.puml'), 'utf8'),
      '!startsub bar\n\' @kind c4_component\nComponent(bar, "Bar", "c4_component")\n!endsub\n',
      'with both new fields omitted the writer must emit slice B\'s Component/3 shape',
    );
  });

  it('test_when_technology_or_description_carries_a_quote_or_newline_then_rejected', async () => {
    const shards = await loadWriter();
    const { root, specDir } = flaggedCorpus();

    // REJECT, never normalize — a rewritten argument renders as something other than
    // what the caller named, and a newline forges an arbitrary PlantUML directive.
    for (const field of ['technology', 'description']) {
      assert.throws(
        () => shards.writeDiagramShard(specDir, 'quoted', { kind: 'c4_component', [field]: 'ok", "X', rootDir: root }),
        /quote escapes the C4 argument/,
        `a double quote in ${field} must be REJECTED, never repaired`,
      );
      assert.throws(
        () => shards.writeDiagramShard(specDir, 'lined', { kind: 'c4_component', [field]: 'ok\nComponent(x)', rootDir: root }),
        /unsafe field/,
        `a newline in ${field} must be REJECTED before it reaches the file`,
      );
    }

    assert.deepEqual(listDiagrams(specDir), [],
      'a rejected field must leave no partial shard behind');
  });

  it('test_when_backfilled_shard_is_rewritten_from_its_own_arguments_then_bytes_identical', async () => {
    const shards = await loadWriter();
    const { root, specDir } = flaggedCorpus();

    const divergent = [];
    for (const file of liveShardFiles()) {
      const id = file.replace(/\.puml$/, '');
      const live = readLiveShard(file);
      const parsed = parseComponent(live);
      assert.ok(parsed, `live shard ${file} must declare a parseable Component line`);
      const kind = KIND_LINE.exec(live)?.[1] ?? null;

      shards.writeDiagramShard(specDir, id, {
        kind,
        label: parsed.label,
        technology: parsed.technology,
        description: parsed.description,
        rootDir: root,
      });

      const rewritten = readFileSync(join(specDir, 'diagrams', file), 'utf8');
      if (rewritten !== live) divergent.push(file);
    }

    // Idempotence is what separates a converged backfill from a hand-edited one: a
    // shard the writer cannot reproduce gets silently rewritten by the next real
    // write, and that diff lands in someone else's workflow.
    assert.deepEqual(divergent, [],
      `every live shard must be reproducible by the writer; divergent: ${divergent.slice(0, 8).join(', ')}`);
  });
});
