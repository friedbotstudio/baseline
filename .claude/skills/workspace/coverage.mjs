// Domain — is the map total over what it claims to describe?
//
// D2's stopping rule: coverage is total over the governed surface, at the coarsest
// anchor that still routes. Stating it mechanically is the point — "every governed
// file resolves to at least one element" is a test, not a judgment re-litigated
// each cycle. The prior cycle had no such rule and drifted to 7% coverage without
// anything noticing.

import { matchesGlob } from '../memory-index/index-io.mjs';
import { resolveGovernedSurface } from './surface.mjs';
import { readAll, walkFiles } from './store.mjs';

// Re-exported rather than re-derived: a second glob implementation in the tests
// would drift from this one and pass while production fails.
export function anchorMatches(anchor, path) {
  return matchesGlob(anchor, path);
}

function underGovernedRoot(path, GOVERNED_SURFACE) {
  return GOVERNED_SURFACE.roots.some((root) => path.startsWith(root));
}

function isCode(path, GOVERNED_SURFACE) {
  return GOVERNED_SURFACE.codeExtensions.some((ext) => path.endsWith(ext))
    || GOVERNED_SURFACE.alwaysIncluded.some((root) => path.startsWith(root));
}

// Prose has no exported interface to digest and fixtures are test data, not
// modelled subjects — both would be permanent coverage gaps nobody can close.
function isExcluded(path, GOVERNED_SURFACE) {
  return GOVERNED_SURFACE.excludedSegments.some((seg) => path.includes(`/${seg}`) || path.startsWith(seg))
    || GOVERNED_SURFACE.excludedTrees.some((tree) => path.startsWith(tree));
}

export function governedFiles({ rootDir = process.cwd() } = {}) {
  // Resolved per call, not imported at module scope: the surface is now a property
  // of the project being modelled, and a caller may be working on a tree that is
  // not its own (/spec-sync on a consumer repo, a test on a tmpdir).
  const surface = resolveGovernedSurface({ rootDir });
  return walkFiles(rootDir).filter(
    (path) => underGovernedRoot(path, surface) && isCode(path, surface) && !isExcluded(path, surface),
  );
}

// anchorSurfaceVerdict tests an anchor against the DECLARED governed surface —
// roots / codeExtensions / excludedTrees from project.json — never the filesystem.
// governedFiles (above) is a disk walk and is right for coverage questions ("what
// governed code exists"); it is wrong for a delta row that DECLARES a not-yet-built
// element, where a greenfield directory would match nothing and no new element
// could ever be declared before its code exists. The three predicates
// (underGovernedRoot / isCode / isExcluded) stay module-private; this composed
// verdict is the only exported surface, so a caller cannot drift from their order.
export function anchorSurfaceVerdict(anchor, { rootDir = process.cwd() } = {}) {
  const surface = resolveGovernedSurface({ rootDir });
  const path = String(anchor);
  if (!underGovernedRoot(path, surface)) return { ok: false, reason: 'outside-root' };
  if (!isCode(path, surface)) return { ok: false, reason: 'undeclared-extension' };
  if (isExcluded(path, surface)) return { ok: false, reason: 'excluded' };
  return { ok: true, reason: null };
}

export function anchorInGovernedSurface(anchor, { rootDir = process.cwd() } = {}) {
  return anchorSurfaceVerdict(anchor, { rootDir }).ok;
}

export function findGaps({ specDir, rootDir = process.cwd() } = {}) {
  const anchors = readAll(specDir).elements.map((element) => element.anchor).filter(Boolean);
  if (!anchors.length) return [];
  return governedFiles({ rootDir })
    .filter((path) => !anchors.some((anchor) => anchorMatches(anchor, path)))
    .map((path) => ({ path, reason: 'unanchored' }));
}
