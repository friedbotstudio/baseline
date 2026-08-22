// Foundation: what the code-structure checker judges.
//
// Split out of oracle.mjs, which measures files and emits findings. Deciding
// WHICH files are measurable is a different question from measuring them, and
// keeping both in one file took the oracle over its own line budget — which the
// oracle then reported, correctly, against itself.

import { matchesAnyGlob } from '../../hooks/lib/glob-match.mjs';

// What this checker judges. Both bars above measure source code against the layer
// model, so a file with no layers cannot violate them: a markdown report, a lockfile
// and a Nunjucks template were each being measured against a line budget derived
// from .mjs source, and each blocked a landing it had nothing to say about.
const CODE_EXTENSIONS = Object.freeze(['.mjs', '.cjs', '.js', '.mts', '.cts', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.sh', '.bash']);

// Test files are excluded for the reason the right-size gate already records: under
// TDD every change ships with a test, so measuring test lines keeps the checker
// permanently over threshold. A test file is long because it holds cases, and
// splitting one to satisfy a line count makes the suite worse, not better. The
// default matches `project.json -> tdd.test_globs`; a project whose tests live
// elsewhere passes its own list, which REPLACES this one rather than extending it.
const DEFAULT_TEST_GLOBS = Object.freeze([
  'tests/**', 'test/**', 'spec/**', '__tests__/**', '**/*_test.*', '**/*.test.*', '**/*.spec.*',
]);

/**
 * Whether this checker has anything to say about a path.
 *
 * Exported so a caller can scope a file list before paying to read every file.
 *
 * @param {unknown} path - repo-relative path.
 * @param {ReadonlyArray<string>} [testGlobs] - overrides the default test globs.
 * @returns {boolean}
 */
export function isJudgedByCodeStructure(path, testGlobs = DEFAULT_TEST_GLOBS) {
  if (typeof path !== 'string' || path === '') return false;
  const dot = path.lastIndexOf('.');
  const ext = dot === -1 ? '' : path.slice(dot).toLowerCase();
  if (!CODE_EXTENSIONS.includes(ext)) return false;
  const globs = Array.isArray(testGlobs) ? testGlobs : DEFAULT_TEST_GLOBS;
  return !matchesAnyGlob(path, globs);
}
