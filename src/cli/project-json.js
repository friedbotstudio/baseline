// Foundation — narrow read-modify-write of <target>/.claude/project.json.
//
// Owns one capability: refresh the top-level `baseline_version` field while
// preserving every other top-level key byte-for-byte. Used by:
//   - src/cli/install.js  (freshInstall + forceInstall) — stamps the field on
//     first install so subsequent upgrades read it back.
//   - src/cli/merge.js    (threeWayMerge end-of-run) — re-stamps the field
//     after every upgrade write path so future upgrades hit the version-aware
//     fast-path. Mirrors saveManifest's contract: post-merge, both manifest
//     and project.json carry the running CLI's version.
//
// Atomic write semantics mirror src/cli/reconciliation-marker.js → write tmp
// then rename, so a partial write cannot corrupt the user's project.json.
//
// Spec: docs/specs/upgrade-version-aware-noop.md §Behavior #7.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PROJECT_JSON_REL = '.claude/project.json';

export async function refreshBaselineVersion(target, version) {
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`refreshBaselineVersion: version must be a non-empty string; got ${JSON.stringify(version)}`);
  }
  const path = join(target, PROJECT_JSON_REL);

  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`refreshBaselineVersion: malformed JSON in ${PROJECT_JSON_REL}: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`refreshBaselineVersion: ${PROJECT_JSON_REL} is not a JSON object`);
  }

  parsed.baseline_version = version;
  const body = JSON.stringify(parsed, null, 2) + '\n';
  if (body === text) return;

  const tmp = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmp, body);
  await rename(tmp, path);
}
