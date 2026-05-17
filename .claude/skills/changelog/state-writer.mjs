// Idempotent writer for .claude/state/changelog/<slug>.json.
//
// Re-invocation on the same (slug, source_commit_sha) re-writes the file with
// identical content except for generated_at / unreleased_inserted_at, which
// always advance. The state object's body content (excluding those two
// timestamps) is byte-equal between invocations — letting the
// idempotent-reentry test compare via JSON.dumps on a clone with those keys
// popped.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function writeState(projectRoot, slug, state) {
  const dir = join(projectRoot, '.claude/state/changelog');
  const path = join(dir, `${slug}.json`);
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
  return path;
}
