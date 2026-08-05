// Domain — reconciliation (AC-006, the literal upstream epic AC-008).
//
// The point of the corpus is that scout stops REDISCOVERING the system every
// cycle. So the return value is a delta scoped to what this cycle touched, and a
// delta that names every element is a re-derivation wearing a delta's clothes.
//
// Fail-open throughout: an absent corpus degrades to discovery rather than
// throwing, matching the surfaceScopedMemory contract every other memory consumer
// already honours, so an unmigrated install no-ops instead of breaking scout.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { matchesGlob } from '../memory-index/index-io.mjs';
import { assertNoTraversal, readAll } from './store.mjs';

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

// ─── Three-case staleness: moved / dangling / stale ───
//
// The digest covers a file's STRUCTURAL INTERFACE, not its bytes (spec D7/D11).
// Digesting bytes would demote every element on a typo, which is the churn that
// makes a model nobody trusts; digesting the interface demotes it exactly when
// something another file could depend on actually moved.

const EXPORTED_SYMBOL = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^\s*export\s*\{([^}]*)\}/gm;
const HEADING = /^#{1,6}\s+(.+?)\s*$/gm;

function digestOf(parts) {
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 12);
}

function codeSurface(text) {
  const names = [...text.matchAll(EXPORTED_SYMBOL)].map((m) => m[1]);
  for (const [, list] of text.matchAll(EXPORT_LIST)) {
    for (const item of list.split(',')) {
      const name = item.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.push(name);
    }
  }
  return names.sort();
}

// A JSON file's interface is its KEY PATHS; the values are configuration a
// diagram never described. Sorted so key order in the file cannot flip the digest.
function jsonSurface(text) {
  const paths = [];
  const walk = (node, prefix) => {
    if (node === null || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push(path);
      walk(node[key], path);
    }
  };
  try {
    walk(JSON.parse(text), '');
  } catch {
    return ['<unparseable>'];
  }
  return paths.sort();
}

// A markdown document's interface is its HEADING STRUCTURE — the same anchoring
// the reviewed prior art uses for prose, recomputed rather than stored.
function markdownSurface(text) {
  return [...text.matchAll(HEADING)].map((m) => m[1]);
}

export function digestFor(path) {
  let text;
  try {
    if (!statSync(path).isFile()) return null;
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  if (/\.(mjs|js|cjs)$/.test(path)) return digestOf(codeSurface(text));
  if (/\.json$/.test(path)) return digestOf(jsonSurface(text));
  if (/\.md$/.test(path)) return digestOf(markdownSurface(text));
  return digestOf([text]);
}

function verdict(element, rootDir) {
  const anchor = element.anchor ?? '';
  if (!anchor) return { element_id: element.id, state: 'moved', detail: 'no anchor' };
  if (anchor.includes('*')) {
    return { element_id: element.id, state: 'moved', detail: 'glob anchor; digest not applicable' };
  }
  const path = join(rootDir, anchor);
  if (!existsSync(path)) {
    return { element_id: element.id, state: 'dangling', detail: `anchor resolves to nothing: ${anchor}` };
  }
  const fresh = digestFor(path);
  if (element.anchor_digest && fresh !== element.anchor_digest) {
    return { element_id: element.id, state: 'stale', detail: `interface digest moved: ${element.anchor_digest} -> ${fresh}` };
  }
  return { element_id: element.id, state: 'moved', detail: 'interface unchanged' };
}

export function classify(memDir, { rootDir = process.cwd() } = {}) {
  const elements = readAll(memDir).elements;
  // Validate EVERY anchor before touching the filesystem. A traversal must fail as
  // a traversal, not as whatever the escaped path happens to contain.
  for (const element of elements) assertNoTraversal(element.anchor ?? '');
  return elements.map((element) => verdict(element, rootDir));
}

export function composableElements(memDir, options = {}) {
  return classify(memDir, options)
    .filter((v) => v.state !== 'dangling')
    .map((v) => v.element_id);
}
