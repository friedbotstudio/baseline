// Domain — roll(): lift element-level edges to concept level.
//
// One turn of the crank that makes the corpus a multi-RESOLUTION model rather than
// a flat node list. An edge internal to one concept is dropped on purpose: at
// concept resolution it says nothing, and keeping it would make every concept
// appear to depend on itself.

const CONCEPT_EDGE_KIND = 'concept';

function membershipIndex(concepts) {
  const owner = new Map();
  for (const concept of concepts) {
    for (const member of concept.members ?? []) owner.set(member, concept.id);
  }
  return owner;
}

// Concept ids are kebab-case (assertSafeFactKey), so a space can never occur inside
// one and is an unambiguous pair separator. An earlier version used a NUL escape
// here; it landed as a raw 0x00 byte, which made the whole file classify as binary
// and silently excluded it from every grep-driven check in this repo.
function pairKey(from, to) {
  return `${from} ${to}`;
}

export function roll(edges = [], concepts = []) {
  const owner = membershipIndex(concepts);
  const lifted = new Map();

  for (const el of edges) {
    const from = owner.get(el.from);
    const to = owner.get(el.to);
    if (!from || !to || from === to) continue;

    const key = pairKey(from, to);
    const seen = lifted.get(key);
    // Weight is the count of element-level crossings, consumed by composeView's
    // ordering (spec D12) so a generated view leads with the strongest coupling.
    if (seen) seen.weight += el.weight ?? 1;
    else lifted.set(key, { from, to, kind: CONCEPT_EDGE_KIND, provenance: 'derived', weight: el.weight ?? 1 });
  }

  return [...lifted.values()];
}
