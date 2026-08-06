// central-system-spec slice F — brownfield bootstrap and merge semantics (AC-021, AC-022, AC-023, AC-024).
//
// A consumer adopting baseline has no spec archive at all: 68% of THIS repo's
// governed files appear in no spec, and a project that never ran the phase has
// none. Rebuild-from-code is their only path, which makes /spec-sync the feature
// that decides whether the central spec is baseline-only or general.
//
// D9 is the rule the refusal test defends: concept membership is AUTHORED. Every
// prior decision in this lineage protects it (seed-cycle D6, backfill D5), so an
// unattended run that inferred it would quietly undo all of them.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function loadModule(rel) {
  const abs = resolve(REPO_ROOT, rel);
  if (!existsSync(abs)) return { module: null, reason: `${rel} does not exist yet` };
  try {
    return { module: await import(abs), reason: null };
  } catch (err) {
    return { module: null, reason: `${rel} exists but failed to load: ${err.message}` };
  }
}

function snapshot(dir) {
  if (!existsSync(dir)) return '(absent)';
  return readdirSync(dir, { recursive: true }).sort().join('\n');
}

// A repo whose layout is nothing like baseline's — the point of the smoke test.
function makeForeignRepo(prefix = 'foreign-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const config = {
    memory: {
      architecture_map: {
        enabled: true,
        governed_surface: {
          roots: ['src/', 'lib/'],
          codeExtensions: ['.mjs'],
          alwaysIncluded: [],
          excludedSegments: ['fixtures/'],
          excludedTrees: [],
        },
      },
    },
  };
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude', 'project.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  mkdirSync(join(root, 'src', 'app'), { recursive: true });
  mkdirSync(join(root, 'lib'), { recursive: true });
  writeFileSync(join(root, 'src', 'app', 'handler.mjs'), 'export const handle = 1;\n', 'utf8');
  writeFileSync(join(root, 'src', 'app', 'router.mjs'), 'export const route = 1;\n', 'utf8');
  writeFileSync(join(root, 'lib', 'db.mjs'), 'export const db = 1;\n', 'utf8');
  const specDir = join(root, 'docs', 'system');
  mkdirSync(specDir, { recursive: true });
  return { root, specDir };
}

const baselineConceptIds = () =>
  readdirSync(join(REPO_ROOT, 'docs/system/concepts')).map((n) => n.replace(/\.md$/, ''));

describe('F — brownfield bootstrap', () => {
  it('test_when_spec_sync_map_confirmed_then_corpus_materializes', async () => {
    const { module: sync, reason } = await loadModule('.claude/skills/workspace/sync.mjs');
    assert.ok(sync, reason);
    const { root, specDir } = makeForeignRepo();

    let sawProposal = null;
    const result = sync.runSync({
      rootDir: root,
      specDir,
      // The seam is a callback parameter, not a mocked module: the human confirming
      // the map IS the contract, so it has to be injectable to test at all.
      confirm: (proposal) => {
        sawProposal = proposal;
        return proposal.concepts;
      },
    });

    assert.ok(sawProposal, 'the sync must PROPOSE a map before writing anything');
    assert.ok(sawProposal.concepts.length >= 2,
      'two clusterable directories should propose at least two concepts');

    const elements = readdirSync(join(specDir, 'elements')).filter((n) => n.endsWith('.md'));
    assert.equal(elements.length, 3, 'every governed file must materialize into an element');
    assert.ok(Array.isArray(result.gaps), 'the sync must report coverage gaps');
    assert.deepEqual(result.gaps, [], 'a freshly synced corpus covers its own governed surface');
  });

  it('test_when_spec_sync_noninteractive_then_refuses_to_infer_membership', async () => {
    const { module: sync, reason } = await loadModule('.claude/skills/workspace/sync.mjs');
    assert.ok(sync, reason);
    const { root, specDir } = makeForeignRepo('foreign-refuse-');
    const before = snapshot(specDir);

    assert.throws(
      () => sync.runSync({ rootDir: root, specDir }),
      /confirm|authored|membership/i,
      'with no confirmation callback the sync must refuse — concept membership is authored (D9)',
    );

    assert.equal(snapshot(specDir), before,
      'a refused sync must write nothing; a partial corpus reflects an intent no human approved');
  });

  it('test_when_merge_produces_duplicate_anchor_then_reported_not_auto_resolved', async () => {
    const { module: reconcile, reason } = await loadModule('.claude/skills/workspace/reconcile.mjs');
    assert.ok(reconcile, reason);
    assert.equal(typeof reconcile.repairAfterMerge, 'function',
      'reconcile.mjs must export repairAfterMerge — a merge is where two records for one anchor appear');

    const { specDir } = makeForeignRepo('merge-');
    mkdirSync(join(specDir, 'elements'), { recursive: true });
    mkdirSync(join(specDir, 'diagrams'), { recursive: true });
    for (const id of ['ours', 'theirs']) {
      writeFileSync(join(specDir, 'elements', `${id}.md`),
        `---\nid: ${id}\nkind: component\ntitle: ${id}\nanchor: lib/db.mjs\n---\n\nbody\n`, 'utf8');
    }
    writeFileSync(join(specDir, 'diagrams', 'ghost.puml'),
      '!startsub ghost\nComponent(ghost, "ghost", "t", "r")\n!endsub\n', 'utf8');

    const report = reconcile.repairAfterMerge({ specDir });

    assert.equal(report.duplicateAnchors.length, 1, 'two records claiming one anchor must be reported once');
    assert.match(JSON.stringify(report.duplicateAnchors), /lib\/db\.mjs/, 'the report must name the anchor');
    assert.equal(report.orphanShards.length, 1, 'a shard with no record is an orphan');
    assert.match(JSON.stringify(report.orphanShards), /ghost/, 'the report must name the orphan');

    assert.ok(existsSync(join(specDir, 'elements', 'ours.md')), 'repair must not delete a record');
    assert.ok(existsSync(join(specDir, 'elements', 'theirs.md')),
      'two different meanings sharing one anchor cannot be told apart mechanically — guessing destroys one');
  });

  it('test_when_consumer_repo_synced_then_zero_baseline_concepts', async () => {
    const { module: sync, reason } = await loadModule('.claude/skills/workspace/sync.mjs');
    assert.ok(sync, reason);
    const { root, specDir } = makeForeignRepo('consumer-');

    sync.runSync({ rootDir: root, specDir, confirm: (proposal) => proposal.concepts });

    const produced = readdirSync(join(specDir, 'concepts')).map((n) => n.replace(/\.md$/, ''));
    const leaked = produced.filter((id) => baselineConceptIds().includes(id));
    assert.deepEqual(leaked, [],
      `a consumer's corpus must model THEIR system; baseline concepts leaked: ${leaked.join(', ')}`);
    assert.ok(produced.length > 0, 'the sync must produce a corpus, not an empty directory');
  });
});

describe('F — regression traps', () => {
  it('test_when_change_lands_then_canonical_category_count_unchanged', async () => {
    const { CANONICAL } = await import(resolve(REPO_ROOT, '.claude/skills/memory-index/categories.mjs'));
    assert.equal(CANONICAL.length, 8, 'the corpus is a docs/ spec artifact, never a ninth memory category');
    for (const forbidden of ['workspace', 'system', 'elements', 'concepts', 'diagrams']) {
      assert.ok(!CANONICAL.includes(forbidden), `CANONICAL must not gain ${forbidden}`);
    }
  });

  it('test_when_readall_called_then_views_stay_empty', async () => {
    const { readAll } = await import(resolve(REPO_ROOT, '.claude/skills/workspace/store.mjs'));
    assert.deepEqual(readAll(join(REPO_ROOT, 'docs/system')).views, [],
      'architecture-map D3 survives the relocation: views are composed on demand, never stored');
  });

  it('test_when_shipped_template_read_then_all_three_flags_absent', () => {
    const template = JSON.parse(readFileSync(join(REPO_ROOT, 'src/project.template.json'), 'utf8'));
    const map = template?.memory?.architecture_map ?? {};
    for (const key of ['enabled', 'governed_surface', 'witnesses']) {
      assert.equal(map[key], undefined, `architecture_map.${key} must ship ABSENT so a consumer reads false`);
    }
    assert.equal(template?.memory?.workspace?.enabled, undefined, 'memory.workspace.enabled must ship absent');
    assert.equal(template?.memory?.annotations?.enabled, undefined, 'memory.annotations.enabled must ship absent');
  });

  it('test_when_unwitnessed_shard_present_then_never_reported_as_error', async () => {
    const { module: reconcile, reason } = await loadModule('.claude/skills/workspace/reconcile.mjs');
    assert.ok(reconcile, reason);
    const { root, specDir } = makeForeignRepo('unwitnessed-');
    mkdirSync(join(specDir, 'elements'), { recursive: true });
    mkdirSync(join(specDir, 'diagrams'), { recursive: true });
    writeFileSync(join(specDir, 'elements', 'flow.md'),
      '---\nid: flow\nkind: component\ntitle: Flow\nanchor: lib/db.mjs\n---\n\nbody\n', 'utf8');
    writeFileSync(join(specDir, 'diagrams', 'flow.puml'),
      "!startsub flow\n' @kind bpmn\nComponent(flow, \"flow\", \"t\", \"r\")\n!endsub\n", 'utf8');

    const verdict = reconcile.classify(specDir, { rootDir: root }).find((v) => v.element_id === 'flow');
    assert.ok(verdict, 'an unwitnessed element must still be classified');
    assert.notEqual(verdict.state, 'stale', 'unwitnessed is not stale');
    assert.notEqual(verdict.state, 'dangling', 'unwitnessed is not dangling — the anchor resolves');
    assert.equal(verdict.citable, false, 'but it is never citable as evidence');
  });
});
