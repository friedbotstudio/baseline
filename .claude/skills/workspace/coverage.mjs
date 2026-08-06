// Domain — is the map total over what it claims to describe?
//
// D2's stopping rule: coverage is total over the governed surface, at the coarsest
// anchor that still routes. Stating it mechanically is the point — "every governed
// file resolves to at least one element" is a test, not a judgment re-litigated
// each cycle. The prior cycle had no such rule and drifted to 7% coverage without
// anything noticing.

import { matchesGlob } from '../memory-index/index-io.mjs';
import { GOVERNED_SURFACE } from './seed-map.mjs';
import { readAll, walkFiles } from './store.mjs';

// Re-exported rather than re-derived: a second glob implementation in the tests
// would drift from this one and pass while production fails.
export function anchorMatches(anchor, path) {
  return matchesGlob(anchor, path);
}

function underGovernedRoot(path) {
  return GOVERNED_SURFACE.roots.some((root) => path.startsWith(root));
}

function isCode(path) {
  return GOVERNED_SURFACE.codeExtensions.some((ext) => path.endsWith(ext))
    || GOVERNED_SURFACE.alwaysIncluded.some((root) => path.startsWith(root));
}

// Prose has no exported interface to digest and fixtures are test data, not
// modelled subjects — both would be permanent coverage gaps nobody can close.
function isExcluded(path) {
  return GOVERNED_SURFACE.excludedSegments.some((seg) => path.includes(`/${seg}`) || path.startsWith(seg))
    || GOVERNED_SURFACE.excludedTrees.some((tree) => path.startsWith(tree));
}

export function governedFiles({ rootDir = process.cwd() } = {}) {
  return walkFiles(rootDir).filter((path) => underGovernedRoot(path) && isCode(path) && !isExcluded(path));
}

export function findGaps({ memDir, rootDir = process.cwd() } = {}) {
  const anchors = readAll(memDir).elements.map((element) => element.anchor).filter(Boolean);
  if (!anchors.length) return [];
  return governedFiles({ rootDir })
    .filter((path) => !anchors.some((anchor) => anchorMatches(anchor, path)))
    .map((path) => ({ path, reason: 'unanchored' }));
}
