// Foundation — the governed surface, resolved from project config.
//
// This lived as a hardcoded constant in seed-map.mjs, a baseline-owned
// manifest-hashed file. A consumer editing it to declare their own roots tripped
// Article XII hash drift, which has no opt-out — so the corpus could only ever
// model THIS repository. Moving it to config is what makes the layer usable by a
// project baseline is not.
//
// REJECT, never guess (spec D6): an absent surface throws. Falling back to
// baseline's own roots would silently model a consumer's `.claude/` and report
// TOTAL coverage over a surface that is not theirs — a wrong answer wearing the
// shape of a right one.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_KEY = 'memory.architecture_map.governed_surface';
const REQUIRED_KEYS = ['roots', 'codeExtensions', 'alwaysIncluded', 'excludedSegments', 'excludedTrees'];

function refuse(detail) {
  throw new Error(`${CONFIG_KEY} ${detail} — declare it in .claude/project.json (there is no default surface)`);
}

// Read from rootDir rather than through projectGet: that helper resolves against
// the process CWD, which is the wrong root for any caller working on a tree other
// than its own — /spec-sync on a fixture, or a test on a tmpdir.
//
// Shared with witness.mjs. The READ is common; the POLICY is not — this module
// refuses an absent surface while witness.mjs falls open to an unwitnessed binding,
// so each keeps its own handling of the null.
export function readProjectConfig(rootDir) {
  try {
    return JSON.parse(readFileSync(join(rootDir, '.claude', 'project.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function resolveGovernedSurface({ rootDir = process.cwd() } = {}) {
  const config = readProjectConfig(rootDir);
  if (!config) refuse('is unreadable');

  const surface = config?.memory?.architecture_map?.governed_surface;
  if (surface === undefined || surface === null) refuse('is not declared');
  if (typeof surface !== 'object' || Array.isArray(surface)) refuse('must be an object');

  const missing = REQUIRED_KEYS.filter((key) => !Array.isArray(surface[key]));
  if (missing.length) refuse(`is missing array keys: ${missing.join(', ')}`);

  return Object.fromEntries(REQUIRED_KEYS.map((key) => [key, surface[key]]));
}
