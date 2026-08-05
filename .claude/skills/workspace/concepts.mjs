// Domain — the concept layer, the one AUTHORED level of the model.
//
// Element granularity is DERIVED from anchor shape (spec D1): no anchor means an
// external actor, a glob means a subsystem, a file path means a component. A
// concept sits above all three and has no filesystem footprint at all, which is
// exactly why it cannot be derived — the concepts that matter here cut across the
// tree (`consent-gates` spans 29 files in 3 top-level areas), so no glob captures
// one. Membership is authored; every edge between members is not (see edges.mjs).

import { assertSafeFactKey } from '../memory-index/migrate.mjs';
import { readRecords, writeRecord } from './store.mjs';

const CONCEPT_FIELDS = ['kind', 'title', 'members'];

// A stored concept never carries `anchor`, but a hand-edited file might. Stripping
// it on read keeps "granularity is a function of anchor shape" total: a concept that
// leaked an anchor would otherwise classify as a component.
function asConcept(record) {
  const { anchor, ...rest } = record;
  return { ...rest, members: record.members ?? [], granularity: 'concept' };
}

export function readConcepts(memDir) {
  return readRecords(memDir, 'concepts').map(asConcept);
}

export function writeConcept(memDir, id, { title = id, members = [] } = {}) {
  assertSafeFactKey(id);
  // Validate BEFORE any read. A traversal id must fail as a traversal, not as the
  // ENOENT it would become if we touched the filesystem first — the error the
  // caller sees is the difference between a caught attack and a confusing bug.
  for (const member of members) assertSafeFactKey(member);

  const known = new Set(readRecords(memDir, 'elements').map((el) => el.id));
  const unresolved = members.filter((member) => !known.has(member));
  if (unresolved.length) return { written: false, id, unresolved };

  writeRecord(memDir, 'concepts', { id, kind: 'concept', title, members }, CONCEPT_FIELDS);
  return { written: true, id };
}

// The reverse lookup multi-membership exists for: one element may be governed by
// two concepts (git_commit_guard is both consent and git policy), and a model that
// forced a single owner would have to lie about one of them.
export function conceptsFor(memDir, elementId) {
  return readConcepts(memDir).filter((concept) => concept.members.includes(elementId));
}
