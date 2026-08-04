// Domain — the two opt-in gates for the workspace corpus (spec decision D5).
//
// Seeding makes the corpus non-empty, and at that instant every scout run would
// switch from discovery to reconcile — for consumers too, with no opt-out. These
// flags make that a deliberate per-project choice.
//
// `projectGet` in hooks/lib/common.mjs was the reuse candidate and does not fit:
// it caches against one module-level path, so it cannot answer for a caller-
// supplied rootDir, and widening it would defeat the cache for every hook that
// reads config on the hot path.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readProjectConfig(rootDir) {
  try {
    return JSON.parse(readFileSync(join(rootDir, '.claude', 'project.json'), 'utf8'));
  } catch {
    // Missing or malformed config means the feature is off, never an exception:
    // a gate that throws on an absent file would break every consumer that has
    // simply not opted in.
    return {};
  }
}

// Strictly `=== true`. A string "true", a 1, or any other truthy value has not
// opted the project in — an opt-in feature stays off unless the config says so
// in the type it declares.
function flagAt(rootDir, name) {
  const config = readProjectConfig(rootDir);
  return config?.memory?.[name]?.enabled === true;
}

export function workspaceEnabled({ rootDir } = {}) {
  return rootDir ? flagAt(rootDir, 'workspace') : false;
}

export function annotationsEnabled({ rootDir } = {}) {
  return rootDir ? flagAt(rootDir, 'annotations') : false;
}
