// Ticket B — four-class edge derivation and concept roll-up (AC-004..AC-008).
//
// The load-bearing property across this file: NOTHING here is authored. Every edge
// is produced by a scanner reading real source, so the graph cannot drift from the
// code the way an authored edge set would. Imports alone left three concepts with
// zero edges (spec D5) — that is why all four classes ship together.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport } from './helpers/memory-fixtures.mjs';
import { makeWorkspace, writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';

const EDGES = '.claude/skills/workspace/edges.mjs';
const STORE = '.claude/skills/workspace/store.mjs';
const ROLL = '.claude/skills/workspace/roll.mjs';

// Foundation — write a source file at `rel` under the fixture root and register an
// element anchored to it, so the scanners have both halves of the join.
function anchoredSource(root, memDir, id, rel, lines) {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, lines.join('\n') + '\n', 'utf8');
  writeWorkspaceElement(memDir, id, { anchor: rel });
  return abs;
}

// The pinned contract is deriveEdges(rootDir, elements) — the element RECORDS,
// not a memDir. Reading them through the real store keeps the tests honest about
// the shape the implementation will actually receive.
async function elementsOf(memDir) {
  const store = await tryImport(STORE);
  assert.ok(store, `${STORE} does not exist yet`);
  return store.readAll(memDir).elements;
}

describe('B — edge derivation', () => {
  it('test_when_derivation_runs_on_seeded_corpus_then_import_edges_reproduce', async () => {
    const edges = await tryImport(EDGES);
    assert.ok(edges, `${EDGES} does not exist yet`);
    const { root, memDir } = makeProject();
    makeWorkspace(memDir);
    anchoredSource(root, memDir, 'hooks-common-lib', 'lib/common.mjs', ['export const x = 1;']);
    anchoredSource(root, memDir, 'surfacing-triggers', 'hooks/trigger.mjs', [
      "import { x } from '../lib/common.mjs';",
      'export const y = x;',
    ]);

    const derived = edges.deriveEdges(root, await elementsOf(memDir));
    const imported = derived.filter((e) => e.kind === 'import');
    assert.ok(
      imported.some((e) => e.from === 'surfacing-triggers' && e.to === 'hooks-common-lib'),
      'a relative import between two anchored elements must produce an import edge',
    );
  });

  // Regression trap. The original fixtures were all single-line imports, so a
  // newline-excluding class in the scanner passed every test while finding 4 of 8
  // real import edges on the live corpus. A multi-line named-import clause is the
  // dominant form in this repo, so the fixture — not the assertion — was the gap.
  it('test_when_import_clause_spans_lines_then_edge_still_derived', async () => {
    const edges = await tryImport(EDGES);
    assert.ok(edges, `${EDGES} does not exist yet`);
    const { root, memDir } = makeProject();
    makeWorkspace(memDir);
    anchoredSource(root, memDir, 'multiline-target', 'lib/common.mjs', [
      'export const readPayload = 1;',
      'export const projectGet = 2;',
    ]);
    anchoredSource(root, memDir, 'multiline-importer', 'hooks/guard.mjs', [
      'import {',
      '  readPayload,',
      '  projectGet,',
      "} from '../lib/common.mjs';",
      'export default [readPayload, projectGet];',
    ]);

    const derived = edges.deriveEdges(root, await elementsOf(memDir));
    assert.ok(
      derived.some((e) => e.kind === 'import' && e.from === 'multiline-importer' && e.to === 'multiline-target'),
      'an import clause spanning newlines must still yield an import edge',
    );
  });

  it('test_when_two_elements_share_state_path_then_state_edge_present', async () => {
    const edges = await tryImport(EDGES);
    assert.ok(edges, `${EDGES} does not exist yet`);
    const { root, memDir } = makeProject();
    makeWorkspace(memDir);
    anchoredSource(root, memDir, 'writer', 'a/writer.mjs', ["const p = '.claude/state/workflow';", 'export default p;']);
    anchoredSource(root, memDir, 'reader', 'b/reader.mjs', ["const p = '.claude/state/workflow';", 'export default p;']);

    const derived = edges.deriveEdges(root, await elementsOf(memDir));
    const state = derived.filter((e) => e.kind === 'state');
    const pair = state.find((e) => [e.from, e.to].sort().join('|') === 'reader|writer');
    assert.ok(pair, 'two elements referencing the same state path must be linked by a state edge');
  });

  it('test_when_element_calls_project_get_then_config_edge_present', async () => {
    const edges = await tryImport(EDGES);
    assert.ok(edges, `${EDGES} does not exist yet`);
    const { root, memDir } = makeProject();
    makeWorkspace(memDir);
    anchoredSource(root, memDir, 'branch-guard', 'hooks/branch.mjs', [
      "const model = projectGet('git.workflow_model');",
      'export default model;',
    ]);

    const derived = edges.deriveEdges(root, await elementsOf(memDir));
    const config = derived.filter((e) => e.kind === 'config');
    assert.ok(
      config.some((e) => e.from === 'branch-guard' && e.to === 'git.workflow_model'),
      'a projectGet call must produce a config edge naming the dot-path it reads',
    );
  });

  it('test_when_skill_md_invokes_skill_then_orchestration_edge_present', async () => {
    const edges = await tryImport(EDGES);
    assert.ok(edges, `${EDGES} does not exist yet`);
    const { root, memDir } = makeProject();
    makeWorkspace(memDir);
    anchoredSource(root, memDir, 'humanizer', 'skills/humanizer/SKILL.md', ['# humanizer', 'Prose pass.']);
    anchoredSource(root, memDir, 'prose', 'skills/prose/SKILL.md', [
      '# prose',
      'Always finish by invoking Skill(humanizer) as the final pass.',
    ]);

    const derived = edges.deriveEdges(root, await elementsOf(memDir));
    const skill = derived.filter((e) => e.kind === 'skill');
    assert.ok(
      skill.some((e) => e.from === 'prose' && e.to === 'humanizer'),
      'a Skill(<name>) invocation in prose must produce an orchestration edge',
    );
  });

  it('test_when_edges_derived_then_every_edge_has_provenance_derived', async () => {
    const edges = await tryImport(EDGES);
    assert.ok(edges, `${EDGES} does not exist yet`);
    const { root, memDir } = makeProject();
    makeWorkspace(memDir);
    anchoredSource(root, memDir, 'base', 'lib/base.mjs', ['export const b = 1;']);
    anchoredSource(root, memDir, 'user', 'app/user.mjs', [
      "import { b } from '../lib/base.mjs';",
      "const f = projectGet('velocity.rightsize.enabled');",
      "const s = '.claude/state/harness_state';",
      'export default [b, f, s];',
    ]);

    const derived = edges.deriveEdges(root, await elementsOf(memDir));
    assert.ok(derived.length > 0, 'the fixture exercises three scanners; derivation must find edges');
    for (const e of derived) {
      assert.equal(e.provenance, 'derived', `edge ${e.from}->${e.to} (${e.kind}) must be stamped provenance: derived`);
    }
  });

  it('test_when_edge_crosses_concept_boundary_twice_then_one_concept_edge_weight_two', async () => {
    const roll = await tryImport(ROLL);
    assert.ok(roll, `${ROLL} does not exist yet`);

    const elementEdges = [
      { from: 'guard-a', to: 'lib-x', kind: 'import', provenance: 'derived' },
      { from: 'guard-b', to: 'lib-x', kind: 'import', provenance: 'derived' },
      { from: 'guard-a', to: 'guard-b', kind: 'import', provenance: 'derived' },
    ];
    const concepts = [
      { id: 'guards', members: ['guard-a', 'guard-b'] },
      { id: 'substrate', members: ['lib-x'] },
    ];

    const lifted = roll.roll(elementEdges, concepts);
    const crossing = lifted.filter((e) => e.from === 'guards' && e.to === 'substrate');
    assert.equal(crossing.length, 1, 'two element edges crossing the same concept pair must lift to ONE concept edge');
    assert.equal(crossing[0].weight, 2, 'the lifted edge carries the summed weight of its crossings');

    const internal = lifted.filter((e) => e.from === 'guards' && e.to === 'guards');
    assert.equal(internal.length, 0, 'an edge internal to one concept must not appear at concept level');
  });
});
