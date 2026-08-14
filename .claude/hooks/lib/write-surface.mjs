// Foundation — read the workflow's declared write surface.
//
// `workflow.json → write_surface[]` is what the relevance filter narrows against.
// Scout is the phase that DISCOVERS which paths a change touches, so nothing can
// derive the surface at scout time; it has to be declared upstream by /triage.
//
// Every negative path returns [] rather than throwing, matching the
// surfaceScopedMemory contract: an absent surface is the fail-open state and
// means "narrow nothing", never "surface nothing".

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// No legitimate glob needs more than `**`, so a longer run is a pattern nobody
// wrote by hand. Refused rather than collapsed: the matcher collapses runs as an
// equivalence, but a member this shape signals a malformed or hostile surface and
// the boundary should say so (CWE-1333, second layer). The bound now has one
// definition, shared with the compiler that does the collapsing.
import { MAX_STAR_RUN } from './glob-match.mjs';

// Rejected outright rather than repaired. A surface member is compared against
// repo-relative entry paths, so an absolute path or a `..` segment cannot match
// anything legitimate — normalizing one would invent a surface the human never
// declared (CWE-22).
function isDeclarablePattern(pattern) {
  if (typeof pattern !== 'string' || !pattern) return false;
  if (pattern.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pattern)) return false;
  if (new RegExp(`\\*{${MAX_STAR_RUN + 1},}`).test(pattern)) return false;
  return !pattern.split(/[\\/]/).includes('..');
}

export function sanitizePatterns(patterns) {
  if (!Array.isArray(patterns)) return [];
  return patterns.filter(isDeclarablePattern);
}

export function readWriteSurface({ rootDir } = {}) {
  if (!rootDir) return [];
  let workflow;
  try {
    workflow = JSON.parse(readFileSync(join(rootDir, '.claude/state/workflow.json'), 'utf8'));
  } catch {
    return [];
  }
  return sanitizePatterns(workflow?.write_surface);
}
