// Domain — expand the authored concept map into element records and membership.
//
// The map is authored (D5); everything below it is mechanical. Grouping by ANCHOR
// before writing is what realizes D6: two concepts declaring one anchor produce one
// element in two concepts, which is the only shape conflicts.duplicateAnchor
// permits — and the case ticket A named and never realized.
//
// Rejection is ATOMIC, in the same register as applyContribution: a corpus holding
// half a map reflects an intent no author had and no reviewer approved.

import { writeConcept } from './concepts.mjs';
import { anchorMatches, governedFiles } from './coverage.mjs';
import { CONCEPT_ANCHORS, CONCEPT_TITLES } from './seed-map.mjs';
import { readAll, writeElement } from './store.mjs';

function declarationsOf(map) {
  return Object.entries(map).flatMap(([concept, rows]) => rows.map((row) => ({ concept, ...row })));
}

function elementsByAnchor(declarations) {
  const byAnchor = new Map();
  for (const declaration of declarations) {
    const existing = byAnchor.get(declaration.anchor);
    if (existing) existing.concepts.push(declaration.concept);
    else byAnchor.set(declaration.anchor, { ...declaration, concepts: [declaration.concept] });
  }
  return [...byAnchor.values()];
}

// Verified BEFORE any write. An anchor matching nothing ships a dangling element,
// and a dangling element is a route to code that is not there.
function assertEveryAnchorResolves(elements, rootDir) {
  const governed = governedFiles({ rootDir });
  const dangling = elements
    .filter((element) => !governed.some((path) => anchorMatches(element.anchor, path)))
    .map((element) => `${element.id} -> ${element.anchor}`);
  if (dangling.length) {
    throw new Error(`unresolvable anchors (materialization refused): ${dangling.join(', ')}`);
  }
}

function membershipOf(elements) {
  const members = new Map();
  for (const element of elements) {
    for (const concept of element.concepts) {
      if (!members.has(concept)) members.set(concept, []);
      members.get(concept).push(element.id);
    }
  }
  return members;
}

// A pre-existing record carries authored fields the map does not know about
// (`source_spec`, `governed_by`, `rests_on`) and, once stamped, its `anchor_digest`.
// Materialization ADDS the map's elements; it is not a rewrite of what is already
// there, so existing fields win and re-running gains nothing but the row itself.
function merged(existing, element) {
  return {
    ...existing,
    id: element.id,
    kind: existing?.kind ?? 'component',
    title: existing?.title ?? element.title,
    anchor: element.anchor,
  };
}

export function materialize({ memDir, rootDir = process.cwd(), map = CONCEPT_ANCHORS } = {}) {
  const elements = elementsByAnchor(declarationsOf(map));
  assertEveryAnchorResolves(elements, rootDir);

  const existingById = new Map(readAll(memDir).elements.map((el) => [el.id, el]));
  const written = elements.map((element) =>
    writeElement(memDir, merged(existingById.get(element.id), element)));

  const members = membershipOf(elements);
  for (const [concept, ids] of members) {
    const result = writeConcept(memDir, concept, { title: CONCEPT_TITLES[concept] ?? concept, members: ids });
    if (!result.written) {
      throw new Error(`concept ${concept} names unresolvable members: ${(result.unresolved ?? []).join(', ')}`);
    }
  }
  return { elements: elements.length, concepts: members.size, written };
}
