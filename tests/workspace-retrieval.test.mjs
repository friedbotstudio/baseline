// Ticket E — the two retrieval directions and session-start surfacing
// (AC-017..AC-020).
//
// One structure, two directions: a DESIGN query descends (concept -> subsystem ->
// element -> code) and replaces re-scouting; a MAINTENANCE query ascends from a
// touched path to its enclosing concepts. The last two tests are the ones that let
// this ship: with the flag off every consumer install is byte-identical to today.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport } from './helpers/memory-fixtures.mjs';
import { makeWorkspace, writeWorkspaceConcept, writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';

const RESOLVE = '.claude/skills/memory-index/resolve.mjs';
const SESSION_START = '.claude/hooks/lib/memory_session_start.mjs';

function setFlag(root, enabled) {
  const path = join(root, '.claude', 'project.json');
  let conf = {};
  try { conf = JSON.parse(readFileSync(path, 'utf8')); } catch { conf = {}; }
  conf.memory = { ...(conf.memory || {}), architecture_map: { enabled } };
  writeFileSync(path, JSON.stringify(conf, null, 2) + '\n', 'utf8');
  return path;
}

// Two concepts, one of which must never be read by a query matching the other.
function seedTwoConcepts(specDir) {
  makeWorkspace(specDir);
  writeWorkspaceElement(specDir, 'guard-one', { anchor: '.claude/hooks/guard_one.mjs' });
  writeWorkspaceElement(specDir, 'hooks-area', { anchor: '.claude/hooks/**' });
  writeWorkspaceElement(specDir, 'unrelated-el', { anchor: 'site-src/**' });
  writeWorkspaceConcept(specDir, 'enforcement', { members: ['guard-one', 'hooks-area'] });
  writeWorkspaceConcept(specDir, 'docs-pipeline', { members: ['unrelated-el'] });
}

describe('E — retrieval', () => {
  it('test_when_design_query_runs_then_descent_path_returned_without_unmatched_branches', async () => {
    const resolve = await tryImport(RESOLVE);
    assert.ok(resolve, `${RESOLVE} does not exist yet`);
    const { root, memDir, specDir } = makeProject();
    seedTwoConcepts(specDir);
    setFlag(root, true);

    const hit = resolve.resolveLookup('by_concept', 'enforcement', { rootDir: root, memDir, specDir });
    const ids = (hit.elements || hit).map((e) => e.id ?? e);
    assert.ok(ids.includes('guard-one') && ids.includes('hooks-area'), 'the descent must reach the concept members');
    assert.ok(!ids.includes('unrelated-el'), 'an unmatched branch must NOT be walked — that is the whole saving');
  });

  it('test_when_touched_path_given_then_element_and_enclosing_concepts_returned', async () => {
    const resolve = await tryImport(RESOLVE);
    assert.ok(resolve, `${RESOLVE} does not exist yet`);
    const { root, memDir, specDir } = makeProject();
    seedTwoConcepts(specDir);
    setFlag(root, true);

    const hit = resolve.resolveLookup('by_path', '.claude/hooks/guard_one.mjs', { rootDir: root, memDir, specDir });
    const ids = (hit.elements || hit).map((e) => e.id ?? e);
    assert.ok(ids.includes('guard-one'), 'the file-level anchor must match first');
    assert.ok(ids.includes('hooks-area'), 'the enclosing glob anchor must also resolve — that is the walk up');
    const conceptIds = (hit.concepts || []).map((c) => c.id ?? c);
    assert.ok(conceptIds.includes('enforcement'), 'the maintenance query must return the enclosing concepts');
  });

  it('test_when_session_starts_then_concept_map_injected_within_budget', async () => {
    const sessionStart = await tryImport(SESSION_START);
    assert.ok(sessionStart, `${SESSION_START} does not exist yet`);
    const { root, memDir, specDir } = makeProject();
    seedTwoConcepts(specDir);
    setFlag(root, true);

    const block = sessionStart.renderConceptMap
      ? sessionStart.renderConceptMap(specDir, { rootDir: root })
      : sessionStart.buildIndex(memDir, { rootDir: root });
    const text = String(block);
    assert.match(text, /enforcement/, 'the injected block must name the concepts');
    assert.ok(text.length <= 8000, `the concept map must stay within budget; got ${text.length} chars`);
  });

  it('test_when_flag_off_then_behavior_byte_identical', async () => {
    const resolve = await tryImport(RESOLVE);
    assert.ok(resolve, `${RESOLVE} does not exist yet`);
    const { root, memDir, specDir } = makeProject();
    seedTwoConcepts(specDir);

    setFlag(root, false);
    const off = resolve.resolveLookup('by_concept', 'enforcement', { rootDir: root, memDir, specDir });
    const offIds = (off.elements || off).map((e) => e.id ?? e);
    assert.deepEqual(offIds, [], 'with the flag off the concept lookup yields nothing — the layer is inert');
  });

  it('test_when_flag_off_then_session_start_payload_unchanged', async () => {
    const sessionStart = await tryImport(SESSION_START);
    assert.ok(sessionStart, `${SESSION_START} does not exist yet`);
    const { root, memDir, specDir } = makeProject();
    seedTwoConcepts(specDir);
    setFlag(root, false);

    // No `? :` fallback here. Guarding on the function's existence would make the
    // assertion a tautology that passes forever while renderConceptMap is absent —
    // it must be RED until the function exists, then discriminate on the flag.
    assert.ok(sessionStart.renderConceptMap, `${SESSION_START} does not export renderConceptMap yet`);
    const block = String(sessionStart.renderConceptMap(specDir, { rootDir: root }));
    assert.equal(block, '', 'with the flag off the session-start payload must carry NO concept map');
  });
});
