// Domain — reference resolution. An element names decisions and constraints BY
// KEY (epic decision D4); this module is what turns a key back into the entry.
//
// Copying rationale into the corpus was the rejected alternative: it creates a
// second thing to keep true, and the store already re-verifies entries.

import { asList, CANONICAL } from '../memory-index/categories.mjs';
import { resolveCategory } from '../memory-index/lift-fields.mjs';
import { firstHook } from '../../hooks/lib/entry-body.mjs';

// `research` is deliberately absent. A research doc is a PATH (docs/research/*.md),
// not a memory key, so routing it through resolveCategory would look up a category
// that does not exist and report every research annotation as dangling — worse than
// not supporting it. Narrowed to what is implemented and tested; see the flagged row.
const ANNOTATION = /^@([a-z-]+):(.+)$/;

// The verb is the singular of the category, so the map is DERIVED from CANONICAL
// rather than restated (spec D2). A second hardcoded category list is exactly what
// slice B collapsed: seven of nine surfaces failed silently when `constraints` was
// added, because each carried its own copy.
const IRREGULAR_VERB = { libraries: 'library' };

function verbFor(category) {
  return IRREGULAR_VERB[category] ?? category.replace(/s$/, '');
}

const CATEGORY_FOR = Object.fromEntries(CANONICAL.map((c) => [verbFor(c), c]));

// Exported so the totality property is testable, and called at module load so a
// ninth category added without a verb fails LOUDLY at import rather than silently
// resolving every one of its annotations as dangling.
export function assertVerbMapTotal(categories, map = CATEGORY_FOR) {
  const covered = new Set(Object.values(map));
  const missing = categories.filter((category) => !covered.has(category));
  if (missing.length) {
    throw new Error(`annotation verb map does not cover canonical categor${missing.length > 1 ? 'ies' : 'y'}: ${missing.join(', ')}`);
  }
  return true;
}

assertVerbMapTotal(CANONICAL);

function entriesIn(memDir, category) {
  try {
    return resolveCategory(memDir, category).entries;
  } catch {
    return [];
  }
}

function keyExists(memDir, category, key) {
  return entriesIn(memDir, category).some((entry) => entry.key === key);
}

// AC-002: every named key must resolve before an element is written. Reported,
// never repaired — a dangling reference silently dropped is how a model starts
// lying about what governs what.
export function resolveRefs(memDir, { governed_by = [], rests_on = [] } = {}) {
  const unresolved = [
    ...asList(governed_by).filter((key) => !keyExists(memDir, 'decisions', key)),
    ...asList(rests_on).filter((key) => !keyExists(memDir, 'constraints', key)),
  ];
  return { resolved: unresolved.length === 0, unresolved };
}

// AC-008 / AC-009. A miss returns {resolved:false, key} rather than throwing or
// returning null: the caller must be able to REPORT the dangling annotation,
// which is impossible if the failure is indistinguishable from "no annotation".
export function resolveAnnotation(memDir, ref) {
  const match = ANNOTATION.exec(String(ref ?? '').trim());
  if (!match) return { resolved: false, key: null, reason: 'not an annotation' };

  const [, verb, rawKey] = match;
  const category = CATEGORY_FOR[verb];
  // An unrecognised verb is not a BROKEN annotation, it is not an annotation at
  // all — `@research:` is the standing example. Reporting it dangling would mark
  // every one of them stale forever, which is louder than the thing it describes.
  if (!category) return { resolved: false, key: null, reason: 'not an annotation' };

  const key = rawKey.trim();
  const entry = entriesIn(memDir, category).find((e) => e.key === key);
  if (!entry) return { resolved: false, key };

  return { resolved: true, key, hook: firstHook(entry.body) };
}
