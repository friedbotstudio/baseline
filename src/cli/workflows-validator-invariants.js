// Domain — Article IV invariant checks (I1..I11). Each `check*` function
// returns an array of named-error objects; empty array means the invariant
// holds. `checkAllInvariants` runs them in order and returns the union.
//
// Named-error shape:
//   { kind: 'invariant_iN', track_id?, node_id?, message, ...details }

import { isKnownPredicate } from './workflows-validator-predicates.js';

// ---------- I1 ----------

export function checkI1_uniqueTrackIds(tracks) {
  const seen = new Map();
  const errors = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (seen.has(t.track_id)) {
      errors.push({
        kind: 'invariant_i1',
        track_id: t.track_id,
        first_line: seen.get(t.track_id) + 1,
        second_line: i + 1,
        message: `Duplicate track_id '${t.track_id}' at index ${i + 1} (first seen at index ${seen.get(t.track_id) + 1}).`,
      });
    } else {
      seen.set(t.track_id, i);
    }
  }
  return errors;
}

// ---------- I2 ----------

export function checkI2_uniqueNodeIdsWithinTrack(tracks) {
  const errors = [];
  for (const t of tracks) {
    const seen = new Set();
    for (const node of t.nodes) {
      if (seen.has(node.id)) {
        errors.push({
          kind: 'invariant_i2',
          track_id: t.track_id,
          node_id: node.id,
          message: `Track '${t.track_id}' has duplicate node id '${node.id}'.`,
        });
      } else {
        seen.add(node.id);
      }
    }
  }
  return errors;
}

// ---------- I3 ----------

export function checkI3_skillOrSubTrackXor(tracks) {
  const errors = [];
  for (const t of tracks) {
    for (const node of t.nodes) {
      if (node.type === 'selector') {
        if (!Array.isArray(node.alternates) || node.alternates.length === 0) {
          errors.push({
            kind: 'invariant_i3',
            track_id: t.track_id,
            node_id: node.id,
            message: `Selector node '${node.id}' in track '${t.track_id}' has empty alternates[]. Selector nodes require non-empty alternates.`,
          });
        }
      } else {
        const hasSkill = typeof node.skill === 'string' && node.skill.length > 0;
        const hasSubTrack = typeof node.sub_track === 'string' && node.sub_track.length > 0;
        if (hasSkill && hasSubTrack) {
          errors.push({
            kind: 'invariant_i3',
            track_id: t.track_id,
            node_id: node.id,
            message: `Task node '${node.id}' in track '${t.track_id}' has BOTH skill and sub_track set. Exactly one of {skill, sub_track} is required.`,
          });
        } else if (!hasSkill && !hasSubTrack) {
          errors.push({
            kind: 'invariant_i3',
            track_id: t.track_id,
            node_id: node.id,
            message: `Task node '${node.id}' in track '${t.track_id}' has NEITHER skill nor sub_track set. Exactly one is required.`,
          });
        }
      }
    }
  }
  return errors;
}

// ---------- I4 ----------

export function checkI4_edgeResolution(tracks) {
  const errors = [];
  for (const t of tracks) {
    const nodeIds = new Set(t.nodes.map((n) => n.id));
    for (const node of t.nodes) {
      for (const dep of node.depends_on || []) {
        if (!nodeIds.has(dep)) {
          errors.push({
            kind: 'invariant_i4',
            track_id: t.track_id,
            node_id: node.id,
            message: `Track '${t.track_id}' node '${node.id}' depends_on '${dep}' which does not exist in the track. (I4: edge resolution)`,
          });
        }
      }
      for (const blk of node.blocks || []) {
        if (!nodeIds.has(blk)) {
          errors.push({
            kind: 'invariant_i4',
            track_id: t.track_id,
            node_id: node.id,
            message: `Track '${t.track_id}' node '${node.id}' blocks '${blk}' which does not exist in the track. (I4: edge resolution)`,
          });
        }
      }
    }
  }
  return errors;
}

// ---------- I5 ----------

export function checkI5_dagAcyclic(tracks) {
  const errors = [];
  for (const t of tracks) {
    const cycle = detectCycle(t.nodes);
    if (cycle) {
      errors.push({
        kind: 'invariant_i5',
        track_id: t.track_id,
        cycle,
        message: `Track '${t.track_id}' has a cycle in its dependency DAG: ${cycle.join(' -> ')}.`,
      });
    }
  }
  return errors;
}

function detectCycle(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(nodes.map((n) => [n.id, WHITE]));
  const stack = [];
  function dfs(id) {
    color.set(id, GRAY);
    stack.push(id);
    const node = byId.get(id);
    for (const dep of node?.depends_on || []) {
      if (!byId.has(dep)) continue;
      const c = color.get(dep);
      if (c === GRAY) {
        const idx = stack.indexOf(dep);
        return stack.slice(idx).concat(dep);
      }
      if (c === WHITE) {
        const found = dfs(dep);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }
  for (const n of nodes) {
    if (color.get(n.id) === WHITE) {
      const found = dfs(n.id);
      if (found) return found;
    }
  }
  return null;
}

// ---------- I6 ----------

export function checkI6_commitsTrackHasGrantCommit(tracks) {
  const errors = [];
  for (const t of tracks) {
    if (!Array.isArray(t.invariants) || !t.invariants.includes('commits')) continue;
    const commitNode = t.nodes.find((n) => n.skill === 'commit');
    if (!commitNode) {
      errors.push({
        kind: 'invariant_i6',
        track_id: t.track_id,
        message: `Track '${t.track_id}' declares 'commits' invariant but contains no node with skill='commit'.`,
      });
      continue;
    }
    const grantCommitNode = t.nodes.find(
      (n) => n.needs_user === true && (n.skill === 'grant-commit' || n.id === 'grant-commit')
    );
    if (!grantCommitNode) {
      errors.push({
        kind: 'invariant_i6',
        track_id: t.track_id,
        message: `Track '${t.track_id}' declares 'commits' invariant but has no needs_user 'grant-commit' node before commit.`,
      });
      continue;
    }
    if (!nodeOrderedBefore(t, grantCommitNode.id, commitNode.id)) {
      errors.push({
        kind: 'invariant_i6',
        track_id: t.track_id,
        message: `Track '${t.track_id}' grant-commit node is not ordered before commit in the dependency DAG.`,
      });
    }
  }
  return errors;
}

function nodeOrderedBefore(track, predecessorId, successorId) {
  const byId = new Map(track.nodes.map((n) => [n.id, n]));
  const visited = new Set();
  function reaches(fromId) {
    if (fromId === successorId) return true;
    if (visited.has(fromId)) return false;
    visited.add(fromId);
    const node = byId.get(fromId);
    for (const blocked of node?.blocks || []) {
      if (reaches(blocked)) return true;
    }
    return false;
  }
  return reaches(predecessorId);
}

// ---------- I7 ----------

export function checkI7_subTrackResolves(tracks) {
  const errors = [];
  const trackMap = new Map(tracks.map((t) => [t.track_id, t]));
  for (const t of tracks) {
    for (const node of t.nodes) {
      const subTrackRefs = collectSubTrackRefs(node);
      for (const ref of subTrackRefs) {
        const target = trackMap.get(ref);
        if (!target) {
          errors.push({
            kind: 'invariant_i7',
            track_id: t.track_id,
            node_id: node.id,
            message: `Track '${t.track_id}' node '${node.id}' references sub_track '${ref}' which does not exist.`,
          });
          continue;
        }
        if (target.selectable === true) {
          errors.push({
            kind: 'invariant_i7',
            track_id: t.track_id,
            node_id: node.id,
            message: `Track '${t.track_id}' node '${node.id}' references sub_track '${ref}' whose selectable=true. Sub-tracks must have selectable=false.`,
          });
        }
      }
    }
  }
  return errors;
}

function collectSubTrackRefs(node) {
  const refs = [];
  if (node.sub_track) refs.push(node.sub_track);
  if (Array.isArray(node.alternates)) {
    for (const alt of node.alternates) {
      if (alt.sub_track) refs.push(alt.sub_track);
    }
  }
  return refs;
}

// ---------- I8 ----------

export function checkI8_skillResolves(tracks, { knownSkills }) {
  const errors = [];
  for (const t of tracks) {
    for (const node of t.nodes) {
      const skillRefs = collectSkillRefs(node);
      for (const skill of skillRefs) {
        if (!knownSkills.has(skill)) {
          errors.push({
            kind: 'invariant_i8',
            track_id: t.track_id,
            node_id: node.id,
            message: `Track '${t.track_id}' node '${node.id}' references skill '${skill}' which does not exist on disk.`,
          });
        }
      }
    }
  }
  return errors;
}

function collectSkillRefs(node) {
  const refs = [];
  if (node.skill) refs.push(node.skill);
  if (Array.isArray(node.alternates)) {
    for (const alt of node.alternates) {
      if (alt.skill) refs.push(alt.skill);
    }
  }
  return refs;
}

// ---------- I9 ----------

export function checkI9_consentGateOrdering(tracks) {
  const errors = [];
  for (const t of tracks) {
    const gates = t.nodes.filter((n) => n.needs_user === true);
    for (const gate of gates) {
      const hasDependents = t.nodes.some((n) =>
        (n.depends_on || []).includes(gate.id)
      );
      if (!hasDependents && gate.id !== lastNodeId(t)) {
        errors.push({
          kind: 'invariant_i9',
          track_id: t.track_id,
          node_id: gate.id,
          message: `Track '${t.track_id}' consent gate '${gate.id}' has no dependent nodes. Consent gates must be followed by at least one dependent unless they terminate the track.`,
        });
      }
    }
  }
  return errors;
}

function lastNodeId(track) {
  return track.nodes[track.nodes.length - 1]?.id;
}

// ---------- I10 ----------

export function checkI10_alternatesCongruent(tracks) {
  const errors = [];
  for (const t of tracks) {
    for (const node of t.nodes) {
      if (node.type !== 'selector') continue;
      const alternates = node.alternates || [];
      if (alternates.length < 2) continue;
      const firstShape = describeAlternate(alternates[0]);
      for (let i = 1; i < alternates.length; i++) {
        const otherShape = describeAlternate(alternates[i]);
        if (otherShape !== firstShape) {
          errors.push({
            kind: 'invariant_i10',
            track_id: t.track_id,
            node_id: node.id,
            message: `Selector node '${node.id}' in track '${t.track_id}' has alternates with divergent shapes. Alternates must be interchangeable in the DAG (same skill vs sub_track distribution).`,
          });
          break;
        }
      }
    }
  }
  return errors;
}

function describeAlternate(alt) {
  return JSON.stringify({
    hasSubTrack: !!alt.sub_track,
    hasSkill: !!alt.skill,
  });
}

// ---------- I11 ----------

export function checkI11_predicateNamesResolve(tracks) {
  const errors = [];
  for (const t of tracks) {
    for (const pred of t.preconditions || []) {
      if (!isKnownPredicate(pred.name)) {
        errors.push({
          kind: 'invariant_i11',
          track_id: t.track_id,
          message: `Track '${t.track_id}' precondition uses unknown predicate '${pred.name}'. Not in v1 vocabulary.`,
        });
      }
    }
    for (const node of t.nodes) {
      if (!Array.isArray(node.alternates)) continue;
      for (const alt of node.alternates) {
        for (const pred of alt.preconditions || []) {
          if (!isKnownPredicate(pred.name)) {
            errors.push({
              kind: 'invariant_i11',
              track_id: t.track_id,
              node_id: node.id,
              message: `Track '${t.track_id}' node '${node.id}' alternate uses unknown predicate '${pred.name}'. Not in v1 vocabulary.`,
            });
          }
        }
      }
    }
  }
  return errors;
}

// ---------- Orchestration ----------

export function checkAllInvariants(tracks, ctx) {
  return [
    ...checkI1_uniqueTrackIds(tracks),
    ...checkI2_uniqueNodeIdsWithinTrack(tracks),
    ...checkI3_skillOrSubTrackXor(tracks),
    ...checkI4_edgeResolution(tracks),
    ...checkI5_dagAcyclic(tracks),
    ...checkI6_commitsTrackHasGrantCommit(tracks),
    ...checkI7_subTrackResolves(tracks),
    ...checkI8_skillResolves(tracks, ctx),
    ...checkI9_consentGateOrdering(tracks),
    ...checkI10_alternatesCongruent(tracks),
    ...checkI11_predicateNamesResolve(tracks),
  ];
}
