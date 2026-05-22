// Foundation — per-target reconciliation marker for create-baseline upgrade.
//
// Records which template hash each customized file was reconciled against by
// `/upgrade-project`, so subsequent `create-baseline upgrade` runs can skip
// files the user has already reviewed. The marker lives at
// <target>/.claude/.baseline-reconciliations.json (gitignore-by-default; see
// docs/specs/upgrade-no-replay-prompts.md non-goal on consumer .gitignore).
//
// Consumed by: src/cli/merge.js (marker-consult branch in threeWayMerge).
// Written by: /upgrade-project skill via the Bash interop the skill describes
//   in its Procedure section (post-RECONCILED step).
// Doctor: src/cli/doctor.js excludes this path from its `added` scan.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MARKER_REL = '.claude/.baseline-reconciliations.json';
const SCHEMA_VERSION = 1;

export class MarkerWriteError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = 'MarkerWriteError';
    if (opts.cause) this.cause = opts.cause;
  }
}

export async function readMarker(target) {
  const path = join(target, MARKER_REL);
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    process.stderr.write(`reconciliation-marker: cannot read ${MARKER_REL}: ${err.message}\n`);
    return null;
  }
  return parseMarker(text);
}

export async function recordReconciliation(target, rel, baseline_version, template_sha) {
  const path = join(target, MARKER_REL);
  const existing = (await readMarker(target)) ?? newMarker();
  existing.reconciliations[rel] = {
    baseline_version,
    reconciled_against_template_sha: template_sha,
    reconciled_at: new Date().toISOString(),
  };
  await atomicWriteJson(path, existing);
}

export function matchesReconciledHash(marker, rel, template_sha) {
  if (!marker || !marker.reconciliations) return false;
  const entry = marker.reconciliations[rel];
  if (!entry) return false;
  return entry.reconciled_against_template_sha === template_sha;
}

export const MARKER_PATH_REL = MARKER_REL;

function newMarker() {
  return { schema_version: SCHEMA_VERSION, reconciliations: {} };
}

function parseMarker(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    process.stderr.write(
      `reconciliation-marker: malformed ${MARKER_REL} (invalid JSON): ${err.message}\n` +
      `  To reset, delete the file: rm ${MARKER_REL}\n`,
    );
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.reconciliations !== 'object') {
    process.stderr.write(
      `reconciliation-marker: malformed ${MARKER_REL} (missing reconciliations object)\n` +
      `  To reset, delete the file: rm ${MARKER_REL}\n`,
    );
    return null;
  }
  if (parsed.schema_version !== SCHEMA_VERSION) {
    process.stderr.write(
      `reconciliation-marker: unsupported schema_version=${parsed.schema_version} in ${MARKER_REL} ` +
      `(this CLI understands schema_version=${SCHEMA_VERSION}); ignoring marker.\n` +
      `  Either upgrade create-baseline, or delete the file: rm ${MARKER_REL}\n`,
    );
    return null;
  }
  return parsed;
}

async function atomicWriteJson(path, obj) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  const body = JSON.stringify(obj, null, 2) + '\n';
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tmp, body);
    await rename(tmp, path);
  } catch (err) {
    throw new MarkerWriteError(
      `cannot write ${MARKER_REL}: ${err.message}`,
      { cause: err },
    );
  }
}
