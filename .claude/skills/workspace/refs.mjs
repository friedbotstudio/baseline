// Domain — reference resolution. An element names decisions and constraints BY
// KEY (epic decision D4); this module is what turns a key back into the entry.
//
// Copying rationale into the corpus was the rejected alternative: it creates a
// second thing to keep true, and the store already re-verifies entries.

import { asList } from '../memory-index/categories.mjs';
import { resolveCategory } from '../memory-index/lift-fields.mjs';
import { firstHook } from '../../hooks/lib/entry-body.mjs';

// `research` is deliberately absent. A research doc is a PATH (docs/research/*.md),
// not a memory key, so routing it through resolveCategory would look up a category
// that does not exist and report every research annotation as dangling — worse than
// not supporting it. Narrowed to what is implemented and tested; see the flagged row.
const ANNOTATION = /^@(decision|constraint):(.+)$/;
const CATEGORY_FOR = { decision: 'decisions', constraint: 'constraints' };

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
  const key = rawKey.trim();
  const entry = entriesIn(memDir, CATEGORY_FOR[verb]).find((e) => e.key === key);
  if (!entry) return { resolved: false, key };

  return { resolved: true, key, hook: firstHook(entry.body) };
}
