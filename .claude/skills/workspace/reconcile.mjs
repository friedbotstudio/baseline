// Domain — reconciliation (AC-006, the literal upstream epic AC-008).
//
// The point of the corpus is that scout stops REDISCOVERING the system every
// cycle. So the return value is a delta scoped to what this cycle touched, and a
// delta that names every element is a re-derivation wearing a delta's clothes.
//
// Fail-open throughout: an absent corpus degrades to discovery rather than
// throwing, matching the surfaceScopedMemory contract every other memory consumer
// already honours, so an unmigrated install no-ops instead of breaking scout.

import { matchesGlob } from '../memory-index/index-io.mjs';
import { readAll } from './store.mjs';

const DISCOVERY = { mode: 'discovery', delta: null };

export function reconcile({ memDir, touchedPaths = [] } = {}) {
  let elements = [];
  try {
    elements = readAll(memDir).elements;
  } catch {
    return DISCOVERY;
  }
  if (!elements.length) return DISCOVERY;

  return { mode: 'reconcile', delta: computeDelta(elements, touchedPaths) };
}

// `added` and `stale` are deliberately NOT returned. `added` would need a prior
// reconcile snapshot that does not exist, and the spec's own Open questions record
// that how an element becomes stale is unresolved. Both were hardcoded/unset-field
// filters — stubs by any reading of Art. VI.1 — so they are deleted rather than
// shipped as always-empty keys that look computed. Amending §Behavior #4's delta
// shape to match is the flagged follow-up.
function computeDelta(elements, touchedPaths) {
  const touched = (el) => touchedPaths.some((path) => matchesGlob(el.anchor, path));
  return {
    changed: elements.filter(touched).map((el) => el.id),
    unreferenced: elements.filter((el) => !el.anchor).map((el) => el.id),
  };
}
