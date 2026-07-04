import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// The CI/secrets-posture artifacts shipped in obj/template (slice J2).
// Single source of truth for the delivery seam: install.js filters these on
// `--no-ci-posture`; merge.js skips them entirely when the target's knob is
// off (never re-deliver, never prune, never prompt).
export const CI_POSTURE_PATHS = Object.freeze([
  '.githooks/pre-commit',
  '.github/branch-protection/main.json',
  'scripts/ci/apply-branch-protection.mjs',
  'scripts/ci/low-risk-classifier.mjs',
  'scripts/ci/require-gitleaks.sh',
]);

// Ancestor directories of CI_POSTURE_PATHS, deepest first, for post-filter
// empty-dir cleanup on an opted-out install.
export const CI_POSTURE_DIRS = Object.freeze([
  '.github/branch-protection',
  '.github',
  '.githooks',
  'scripts/ci',
  'scripts',
]);

// Default-on: a missing project.json, an unreadable one, or an absent knob
// all mean "enabled". Only an explicit `ci_posture.enabled: false` opts out.
export async function readCiPostureEnabled(targetDir) {
  try {
    const raw = await readFile(join(targetDir, '.claude/project.json'), 'utf8');
    return JSON.parse(raw)?.ci_posture?.enabled !== false;
  } catch {
    return true;
  }
}
