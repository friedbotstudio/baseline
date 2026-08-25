// Foundation — the vendored PlantUML jar as a test precondition.
//
// The jar is ~19 MB, gitignored, and side-fetched at install time. A dev tree
// that ran the installer has it; a fresh CI checkout never does. Tests needing
// its real bytes must SKIP when it is absent rather than fail, because the
// failure they produce otherwise is actively misleading: the runtime sandbox
// builders degrade `withJar: true` to a jar-less sandbox, so a test asserting on
// the java-absent remedy fails complaining about the jar instead.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const VENDORED_JAR = join(REPO_ROOT, '.claude/bin/plantuml.jar');

// node:test reads a truthy `skip` as the reason string and `false` as "run it".
export const JAR_SKIP = existsSync(VENDORED_JAR)
  ? false
  : `the vendored plantuml.jar is absent at ${VENDORED_JAR} — run \`npx @friedbotstudio/create-baseline install\` to fetch it`;

// Anchored at the repo root so the read does not depend on the runner's cwd.
export function vendoredJarBytes() {
  return readFileSync(VENDORED_JAR);
}
