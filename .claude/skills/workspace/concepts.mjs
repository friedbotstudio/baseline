// Domain — the concept layer, the one AUTHORED level of the model.
//
// Element granularity is DERIVED from anchor shape (spec D1): no anchor means an
// external actor, a glob means a subsystem, a file path means a component. A
// concept sits above all three and has no filesystem footprint at all, which is
// exactly why it cannot be derived — the concepts that matter here cut across the
// tree (`consent-gates` spans 29 files in 3 top-level areas), so no glob captures
// one. Membership is authored; every edge between members is not (see edges.mjs).

import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { deriveId } from './identity.mjs';
import { readRecords, writeRecord } from './store.mjs';

const CONCEPT_FIELDS = ['kind', 'title', 'anchors', 'members'];

// A stored concept never carries `anchor`, but a hand-edited file might. Stripping
// it on read keeps "granularity is a function of anchor shape" total: a concept that
// leaked an anchor would otherwise classify as a component.
function asConcept(record) {
  const { anchor, ...rest } = record;
  return { ...rest, members: record.members ?? [], granularity: 'concept' };
}

export function readConcepts(specDir) {
  return readRecords(specDir, 'concepts').map(asConcept);
}

// `anchors:` is the AUTHORED half of the model — the one hand-edited surface left
// after seed-map.mjs was retired. Each entry is either `id=path`, which preserves a
// semantic id a human chose, or a bare `path`, whose id is derived. Kept out of the
// codec's LIST_FIELDS deliberately: the `id=` pair form is a concept-layer meaning,
// not a generic list, and teaching the codec about it would spread that meaning.
function parseAnchorRow(entry, conceptTitle) {
  const text = entry.trim();
  if (!text) return null;
  const eq = text.indexOf('=');
  const anchor = eq === -1 ? text : text.slice(eq + 1).trim();
  if (!anchor) return null;
  const id = eq === -1 ? deriveId(anchor) : text.slice(0, eq).trim();
  return { id, anchor, title: conceptTitle };
}

// The shape materialize consumes: { <concept id>: [{ id, anchor, title }] }.
export function readConceptMap(specDir) {
  const map = {};
  for (const concept of readConcepts(specDir)) {
    const declared = String(concept.anchors ?? '').split(',');
    const rows = declared.map((entry) => parseAnchorRow(entry, concept.title ?? concept.id)).filter(Boolean);
    if (rows.length) map[concept.id] = rows;
  }
  return map;
}

export function conceptTitles(specDir) {
  return Object.fromEntries(readConcepts(specDir).map((c) => [c.id, c.title ?? c.id]));
}

// `anchors` is authored; membership is derived. Materialization rewrites the
// concept record on every run, so the authored field must be carried forward from
// the record on disk unless the caller states a new one — otherwise the first
// materialize silently erases the map it was built from.
export function writeConcept(specDir, id, { title = id, members = [], anchors } = {}) {
  assertSafeSlug(id, 'concept id');
  // Validate BEFORE any read. A traversal id must fail as a traversal, not as the
  // ENOENT it would become if we touched the filesystem first — the error the
  // caller sees is the difference between a caught attack and a confusing bug.
  for (const member of members) assertSafeSlug(member, 'concept member');

  const known = new Set(readRecords(specDir, 'elements').map((el) => el.id));
  const unresolved = members.filter((member) => !known.has(member));
  if (unresolved.length) return { written: false, id, unresolved };

  const existing = readConcepts(specDir).find((c) => c.id === id);
  const carried = anchors ?? existing?.anchors ?? '';
  writeRecord(specDir, 'concepts', { id, kind: 'concept', title, anchors: carried, members }, CONCEPT_FIELDS);
  return { written: true, id };
}

// The reverse lookup multi-membership exists for: one element may be governed by
// two concepts (git_commit_guard is both consent and git policy), and a model that
// forced a single owner would have to lie about one of them.
export function conceptsFor(specDir, elementId) {
  return readConcepts(specDir).filter((concept) => concept.members.includes(elementId));
}
