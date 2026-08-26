// The shipped track file and the live one must agree on everything a consumer
// executes. They are two hand-maintained files — build-template.sh Stage 2 copies
// the template over the live name, it does not generate one from the other — so
// nothing but this suite notices when an edit lands in only one of them.
//
// Every other track test in this repo reads `.claude/workflows.jsonl`. That is
// why four defects shipped: the power track's config-flag fence, the chore
// track's internal_phases, the epic track's roadmap-sync node, and the epic
// authorization prose were all correct live and absent from the template, with a
// green suite the whole time.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = '.claude/workflows.jsonl';
const TEMPLATE = 'src/.claude/workflows.template.jsonl';

// Nodes that belong ONLY in the dev tree. Both name skills whose SKILL.md opens
// "Dev-only"; a consumer install has no use for either, so the template omits
// them by design. The last test pins that property, so this list cannot quietly
// grow to cover ordinary drift.
const DEV_ONLY_NODES = ['spec-shippability-review', 'cli-copy-review'];

function loadTracks(rel) {
  const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
  const tracks = {};
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const track = JSON.parse(line);
    tracks[track.track_id] = track;
  }
  return tracks;
}

// Remove the dev-only nodes from a live track and heal the DAG around each one,
// so what remains is what the template is expected to declare. Rewiring rather
// than deleting the edges is the whole point: a removed node's predecessor must
// inherit its successors, or the comparison reports a false difference on every
// track that carries one.
function stripDevOnly(track) {
  const removed = new Set(DEV_ONLY_NODES);
  const byId = new Map(track.nodes.map((n) => [n.id, n]));

  const resolveForward = (id, seen = new Set()) => {
    if (!removed.has(id) || seen.has(id)) return removed.has(id) ? [] : [id];
    seen.add(id);
    return (byId.get(id)?.blocks ?? []).flatMap((next) => resolveForward(next, seen));
  };
  const resolveBackward = (id, seen = new Set()) => {
    if (!removed.has(id) || seen.has(id)) return removed.has(id) ? [] : [id];
    seen.add(id);
    return (byId.get(id)?.depends_on ?? []).flatMap((prev) => resolveBackward(prev, seen));
  };

  const dedupe = (xs) => [...new Set(xs)];

  return track.nodes
    .filter((n) => !removed.has(n.id))
    .map((n) => ({
      ...n,
      depends_on: dedupe((n.depends_on ?? []).flatMap((id) => resolveBackward(id))),
      blocks: dedupe((n.blocks ?? []).flatMap((id) => resolveForward(id))),
    }));
}

const live = loadTracks(LIVE);
const template = loadTracks(TEMPLATE);

describe('shipped track template parity', () => {
  it('test_when_track_rosters_compared_then_both_files_declare_the_same_tracks', () => {
    assert.deepEqual(
      Object.keys(template).sort(),
      Object.keys(live).sort(),
      'a track declared in one file and not the other ships a pipeline the consumer cannot run',
    );
  });

  it('test_when_dev_only_nodes_are_stripped_from_live_then_the_template_matches_node_for_node', () => {
    for (const id of Object.keys(live)) {
      if (!template[id]) continue; // roster test above owns that failure
      assert.deepEqual(
        template[id].nodes,
        stripDevOnly(live[id]),
        `track "${id}": the shipped node graph differs from the live one after removing ${DEV_ONLY_NODES.join(' + ')}`,
      );
    }
  });

  it('test_when_preconditions_are_compared_then_they_are_identical_per_track', () => {
    for (const id of Object.keys(live)) {
      if (!template[id]) continue;
      assert.deepEqual(
        template[id].preconditions ?? null,
        live[id].preconditions ?? null,
        `track "${id}": a precondition present live and absent in the template makes the track selectable on a consumer install when it should not be`,
      );
    }
  });

  it('test_when_internal_phases_are_compared_then_they_are_identical_per_track', () => {
    for (const id of Object.keys(live)) {
      if (!template[id]) continue;
      assert.deepEqual(
        template[id].internal_phases ?? null,
        live[id].internal_phases ?? null,
        `track "${id}": internal_phases left out of the template derives its conditionals straight into exceptions at triage instead of leaving them for the track skill to resolve`,
      );
    }
  });

  it('test_when_epic_descriptions_are_read_then_neither_file_documents_the_retired_approved_boolean', () => {
    for (const [label, tracks] of [['live', live], ['template', template]]) {
      for (const id of ['epic', 'epic-child']) {
        const description = tracks[id]?.description ?? '';
        assert.doesNotMatch(
          description,
          /approved\s*:?\s*true/i,
          `${label} "${id}": authorization derives from the direction-approval token, not from the epic state's approved flag — the boolean was retired precisely because a write-side detector alone could not stop a forged one`,
        );
        assert.match(
          description,
          /approval token|spec_approvals/,
          `${label} "${id}": the description must name the token the guard actually reads`,
        );
      }
    }
  });

  it('test_when_the_dev_only_allowlist_is_read_then_every_member_names_a_dev_only_skill', () => {
    for (const id of DEV_ONLY_NODES) {
      const skillPath = join(REPO_ROOT, '.claude/skills', id, 'SKILL.md');
      assert.ok(existsSync(skillPath), `allowlisted node "${id}" must name a real skill at .claude/skills/${id}/SKILL.md`);
      assert.match(
        readFileSync(skillPath, 'utf8'),
        /Dev-only/,
        `allowlisted node "${id}" must be a Dev-only skill — the allowlist exempts nodes from parity and is not a place to park ordinary drift`,
      );
    }
  });
});
