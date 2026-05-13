import { access } from 'node:fs/promises';
import { join } from 'node:path';

// `.claude/.baseline-manifest.json` is the strongest "previously installed by
// create-baseline" signal — its presence implies a successful install. Listing
// it as a sentinel surfaces a more specific conflict message than `.claude` alone
// (which would also fire on a hand-rolled `.claude/` dir).
//
// Note: the previous concern about `README.md` being clobbered on fresh install
// no longer applies — the allowlist build (scripts/build-template.sh) ships no
// README.md, so users keep their own.
export const SENTINEL_PATHS = Object.freeze([
  '.claude',
  '.claude/.baseline-manifest.json',
  'CLAUDE.md',
  '.mcp.json',
  'docs/init/seed.md',
]);

export async function scanSentinels(target) {
  const found = [];
  for (const sentinel of SENTINEL_PATHS) {
    try {
      await access(join(target, sentinel));
      found.push(sentinel);
    } catch {
      // Not present (ENOENT or otherwise inaccessible) — treat as absent.
    }
  }
  return found;
}
