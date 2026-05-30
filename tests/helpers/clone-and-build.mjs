// Shared test helper: clone the repo into a per-test tmpdir and run
// scripts/build-template.sh there, so a test reads ITS OWN obj/template instead
// of the live REPO_ROOT/obj/template.
//
// Why: the live obj/template is rm -rf'd + rebuilt by the build-exercising
// tests (build-template.test.mjs et al.). Any test that READS the live tree
// races those rebuilds under parallel `npm test`, producing intermittent ENOENT
// / half-written-manifest failures. Building into an isolated tmpdir removes the
// shared mutable state. build-template.sh holds a TMPDIR-global mkdir mutex, so
// concurrent isolated builds serialize safely rather than corrupting each other.

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Clone + build; returns the tmp PKG_ROOT (its obj/template is freshly built).
export async function cloneAndBuild(label) {
  const tmp = await mkdtemp(join(tmpdir(), label));
  const rsync = spawnSync('rsync', [
    '-a',
    '--exclude=node_modules',
    '--exclude=obj',
    '--exclude=.git',
    '--exclude=docs/archive',
    '--exclude=.playwright-mcp',
    `${REPO_ROOT}/`,
    tmp,
  ], { encoding: 'utf8' });
  if (rsync.status !== 0) throw new Error(`rsync failed: ${rsync.stderr}`);
  const build = spawnSync('bash', [join(tmp, 'scripts/build-template.sh')], {
    env: { ...process.env, PKG_ROOT: tmp, CLAUDE_PROJECT_DIR: tmp },
    encoding: 'utf8',
  });
  if (build.status !== 0) throw new Error(`build failed: ${build.stderr || build.stdout}`);
  return tmp;
}

// Convenience: clone + build and return the path to the freshly-built shipped
// .claude/ subtree (obj/template/.claude) — the consumer-install root.
export async function buildShippedClaudeDir(label) {
  const tmp = await cloneAndBuild(label);
  return join(tmp, 'obj/template/.claude');
}

export { REPO_ROOT };
