// Domain — edge derivation across four coupling classes.
//
// Nothing here is authored. Every edge is read out of real source, so the graph
// cannot drift from the code the way an authored edge set would, and no human
// ratification gate is needed to trust it (spec D4, and the reason this design
// diverges from the reviewed prior art's model-proposes/human-ratifies edges).
//
// All four classes ship together (D5): imports alone left build-distribution,
// project-config and design-routing with zero edges, which is a property of the
// scanner, not of those concepts.

import { readSourceText } from './store.mjs';

// The clause between `import` and `from` MUST be allowed to span newlines — a
// multi-line named-import list is the dominant form in this repo, and a
// newline-excluding class silently found only the single-line ones. Bounded at 400
// chars and lazy so it cannot run past its own statement into the next.
const RELATIVE_IMPORT = /(?:^|\n)\s*(?:import|export)\b(?:[^;'"]{0,400}?\bfrom\b)?\s*["']([^"']+)["']/g;
const STATE_PATH = /\.claude\/state\/[A-Za-z0-9_-]+/g;
const CONFIG_KEY = /projectGet\(\s*['"]\.?([A-Za-z0-9_.]+)['"]/g;
const SKILL_CALL = /Skill\(\s*([a-z][a-z0-9-]*)\s*[),]/g;

function edge(from, to, kind) {
  return { from, to, kind, provenance: 'derived', weight: 1 };
}

// Only file-anchored elements can own a source file. A glob-anchored element names
// a subsystem, and attributing a specific import to "the whole skills layer" would
// be a claim the code does not make.
function fileAnchored(elements) {
  return elements.filter((el) => el.anchor && !el.anchor.includes('*'));
}

function resolveRelative(fromRel, spec) {
  const segments = fromRel.split('/').slice(0, -1).concat(spec.split('/'));
  const out = [];
  for (const part of segments) {
    if (part === '.' || part === '') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function scanImports(sources, byAnchor) {
  const found = [];
  for (const { id, anchor, text } of sources) {
    for (const [, spec] of text.matchAll(RELATIVE_IMPORT)) {
      if (!spec.startsWith('.')) continue;
      const target = byAnchor.get(resolveRelative(anchor, spec));
      if (target && target !== id) found.push(edge(id, target, 'import'));
    }
  }
  return found;
}

// A handshake is symmetric — two elements naming the same state file are coupled
// through it regardless of which writes and which reads, and the scanner cannot
// tell those apart. One edge per unordered pair, emitted from the lexically first.
function scanStatePaths(sources) {
  const holders = new Map();
  for (const { id, text } of sources) {
    for (const [literal] of [...text.matchAll(STATE_PATH)].map((m) => [m[0]])) {
      if (!holders.has(literal)) holders.set(literal, new Set());
      holders.get(literal).add(id);
    }
  }
  const found = [];
  for (const ids of holders.values()) {
    const sorted = [...ids].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) found.push(edge(sorted[i], sorted[j], 'state'));
    }
  }
  return found;
}

// The target is the config KEY, not an element: nothing owns project.json as an
// anchor, and inventing an element for it would put a file in the model that no
// maintainer would ever open.
function scanConfigKeys(sources) {
  const found = [];
  for (const { id, text } of sources) {
    for (const [, key] of text.matchAll(CONFIG_KEY)) found.push(edge(id, key, 'config'));
  }
  return found;
}

function scanSkillCalls(sources, byId) {
  const found = [];
  for (const { id, text } of sources) {
    for (const [, name] of text.matchAll(SKILL_CALL)) {
      if (byId.has(name) && name !== id) found.push(edge(id, name, 'skill'));
    }
  }
  return found;
}

export function deriveEdges(rootDir, elements = []) {
  const anchored = fileAnchored(elements);
  const byAnchor = new Map(anchored.map((el) => [el.anchor, el.id]));
  const byId = new Set(elements.map((el) => el.id));

  const sources = [];
  for (const el of anchored) {
    const text = readSourceText(rootDir, el.anchor);
    if (text !== null) sources.push({ id: el.id, anchor: el.anchor, text });
  }

  return [
    ...scanImports(sources, byAnchor),
    ...scanStatePaths(sources),
    ...scanConfigKeys(sources),
    ...scanSkillCalls(sources, byId),
  ];
}
