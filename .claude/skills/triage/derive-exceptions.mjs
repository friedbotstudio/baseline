#!/usr/bin/env node
// Derives a workflow's `exceptions[]` from the chosen track's DAG.
//
// The defect this cures: a phase skill declares a prereq its own track can never
// satisfy. `integrate` wants `security` in completed|exceptions, but the chore DAG
// has no security node. `/spec` wants `research`, but the power DAG has no research
// node — that one blocked a real spec write. Hand-authoring `exceptions` meant every
// new track re-armed the same trap.
//
// A phase with no node in the track is structurally unreachable, so it is excepted.
// Two things are NOT:
//   - a consent gate (see CONSENT_DENY_LIST) — excepting one is a gate BYPASS;
//   - a track's `internal_phases[]` — those are conditionals the track's own skill
//     resolves at runtime into completed (it ran) or exceptions (its trigger did
//     not fire). Derivation cannot pre-judge them: at triage time the diff does
//     not exist yet.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Excepting `approve-direction` would let track_guard authorise tdd artifact writes
// with NO approval token on disk. Nothing in workflows.jsonl requires a track to
// declare an approve-direction node, so a lean or malformed track would silently
// reach that state. Fail CLOSED: a missing gate node is a malformed track, never a
// licence to skip the gate.
export const CONSENT_DENY_LIST = Object.freeze(['approve-direction', 'approve-swarm', 'grant-commit', 'commit']);

// A selector node carries no `metadata.phase` of its own — its phases live in the
// sub_tracks its alternates name. Counting only the track's own nodes therefore
// excepts a phase that IS reachable, which is the same class of defect this module
// exists to kill, one level down. `tdd` on a selector-bearing track is the concrete
// case: the phase is reachable through `tdd-worker-chain`, so excepting it would let
// track_guard block the very implementation write the track exists to perform.
//
// One level only, matching I7 — a sub_track is never itself selectable, so its nodes
// cannot nest another selector.
function reachablePhases(trackNodes, subTracks) {
  const phases = new Set();
  const add = (nodes) => {
    for (const node of nodes ?? []) {
      if (node?.metadata?.phase) phases.add(node.metadata.phase);
    }
  };
  add(trackNodes);
  for (const node of trackNodes ?? []) {
    for (const alternate of node?.alternates ?? []) {
      const id = alternate?.sub_track;
      if (id && subTracks?.get) add(subTracks.get(id)?.nodes);
    }
  }
  return phases;
}

export function deriveExceptions(trackNodes, allPhases, internalPhases = [], authored = [], { subTracks } = {}) {
  if (!Array.isArray(trackNodes)) {
    throw new TypeError(`deriveExceptions: trackNodes must be an array, received ${typeof trackNodes}`);
  }

  const declared = reachablePhases(trackNodes, subTracks);
  const internal = new Set(Array.isArray(internalPhases) ? internalPhases : []);
  const universe = Array.isArray(allPhases) ? allPhases : [];

  const unreachable = universe.filter((phase) => !declared.has(phase) && !internal.has(phase));
  const union = new Set([...(Array.isArray(authored) ? authored : []), ...unreachable]);

  for (const gate of CONSENT_DENY_LIST) union.delete(gate);

  return [...union].sort();
}

// The phase universe is DERIVED, never hardcoded: a static roster would rot the
// moment a track adds a phase, which is the very drift class this module exists to
// kill.
function phaseUniverse(tracks) {
  const phases = new Set();
  for (const track of tracks) {
    for (const node of track?.nodes ?? []) {
      if (node?.metadata?.phase) phases.add(node.metadata.phase);
    }
  }
  return [...phases];
}

async function readTracks(workflowsPath) {
  const raw = await readFile(workflowsPath, 'utf8');
  return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

async function main(trackId) {
  const tracks = await readTracks('.claude/workflows.jsonl');
  const track = tracks.find((t) => t.track_id === trackId);
  if (!track) {
    process.stderr.write(`derive-exceptions: unknown track '${trackId}'\n`);
    process.exit(1);
  }
  const subTracks = new Map(tracks.map((t) => [t.track_id, t]));
  const exceptions = deriveExceptions(track.nodes, phaseUniverse(tracks), track.internal_phases ?? [], [], { subTracks });
  process.stdout.write(JSON.stringify(exceptions) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]);
}
