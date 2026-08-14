// Domain — diff a drafted spec against the standing model at docs/system/.
//
// Article II: this REPORTS. It never writes a byte of the spec. A helper that
// edited the spec would move a written decision out of main context, and the
// only thing keeping that boundary honest is that there is no write path here.
//
// Three findings, each answering a different question the author cannot answer
// by rereading their own draft:
//   undeclared  — the write_set touches an element the System delta never names.
//   reuse       — an element already models part of the write_set, so the spec
//                 should extend it rather than build alongside it.
//   corrections — a delta row names an element id that does not resolve.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { extractWriteSet, patternsOverlap } from '../../hooks/lib/write-set-profile.mjs';
import { parseDelta } from '../workspace/delta.mjs';

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export class CorpusMissingError extends Error {
  constructor(dir) {
    super(`corpus not found: ${dir} — /spec continues without the optimization pass`);
    this.name = 'CorpusMissingError';
  }
}

// REJECT, never repair. canonicalSlug in common.mjs is a NORMALIZER: routing a
// malformed slug through it would silently resolve to a different valid path,
// which is the traversal (CWE-22), not the fix for it.
export function assertSafeSlug(slug) {
  if (typeof slug !== 'string' || !SAFE_SLUG.test(slug)) {
    throw new Error(`unsafe slug: ${JSON.stringify(slug)} — expected /^[a-z0-9][a-z0-9-]*$/`);
  }
  return slug;
}

export function analyzeSpec({ specPath, rootDir }) {
  const spec = readFileSync(specPath, 'utf8');
  const elements = readElements(join(rootDir, 'docs/system/elements'));
  const writeSet = extractWriteSet(spec);
  const declared = parseDelta(spec).rows;

  return {
    undeclared: undeclaredElements(elements, writeSet, declared),
    reuse: reuseCandidates(elements, writeSet),
    corrections: danglingRows(declared, elements),
  };
}

function readElements(dir) {
  if (!existsSync(dir)) throw new CorpusMissingError(dir);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => elementFrom(join(dir, name)))
    .filter(Boolean);
}

function elementFrom(path) {
  const parts = readFileSync(path, 'utf8').split('---');
  if (parts.length < 3) return null;
  const meta = Object.fromEntries(
    parts[1].trim().split('\n').map((line) => {
      const at = line.indexOf(':');
      return at === -1 ? [line.trim(), ''] : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
  return meta.id ? { elementId: meta.id, anchor: meta.anchor ?? '', kind: meta.kind ?? '' } : null;
}

// Anchor and write_set are both glob-ish path patterns, so both call sites below
// ask the pattern-against-pattern question. `patternsOverlap` is the
// bidirectional predicate; `pathOverlapsWriteSet` beside it in the same module is
// the one-directional one, and they are not interchangeable here.
function undeclaredElements(elements, writeSet, declared) {
  const named = new Set(declared.map((row) => row.elementId));
  return elements
    .filter((el) => !named.has(el.elementId) && writeSet.some((p) => patternsOverlap(el.anchor, p)))
    .map((el) => ({ elementId: el.elementId, anchor: el.anchor, reason: 'write_set touches this element but no System delta row names it' }));
}

function reuseCandidates(elements, writeSet) {
  return elements
    .filter((el) => writeSet.some((p) => patternsOverlap(el.anchor, p)))
    .map((el) => ({ elementId: el.elementId, anchor: el.anchor, reason: 'an element already models this anchor — extend it rather than building alongside it' }));
}

function danglingRows(declared, elements) {
  const known = new Set(elements.map((el) => el.elementId));
  return declared
    .filter((row) => row.verb !== 'add' && !known.has(row.elementId))
    .map((row) => ({ elementId: row.elementId, anchor: row.anchor, reason: `delta row \`${row.verb}\` names an element id that does not resolve under docs/system/elements/` }));
}

