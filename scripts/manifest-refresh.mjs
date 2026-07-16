// manifest-refresh — the rebuild-tax lever's portable entry (D2, spec
// docs/specs/velocity-lever-ranking.md, D-2).
//
// Delegates to `build-template.sh --manifest-only`, which runs only Stages
// 1/1.5/2/3 (copy → prune → overlay → manifest) and skips the memory-seed,
// mirror-sync, prose-scan, CI-artifacts, and audit stages. This re-stamps the
// manifest cheaply mid-workflow; the authoritative full build + audit still
// gates at integrate. The stage-skipping logic lives in the bash script (one
// tested copy path); this wrapper only invokes it and propagates its exit code
// so `npm run manifest:refresh` has a portable node entry.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * @param {object} [opts]
 * @param {Function} [opts.spawn] - injectable spawnSync (for tests)
 * @param {string} [opts.buildScript] - path to build-template.sh
 * @returns {number} the child process exit status (non-zero on failure; a null
 *   status — e.g. a killed child — maps to 1, never a false success).
 */
export function runManifestRefresh({ spawn = spawnSync, buildScript = join(SCRIPT_DIR, 'build-template.sh') } = {}) {
  const res = spawn('bash', [buildScript, '--manifest-only'], { stdio: 'inherit' });
  const status = res && typeof res.status === 'number' ? res.status : 1;
  return status;
}

// CLI entry: run and exit with the child's status.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(runManifestRefresh());
}
