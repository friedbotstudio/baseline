// Domain — annotation discovery (AC-001, AC-002, AC-009).
//
// `resolveAnnotation` turns ONE reference into an entry. This module is what finds
// the references in the first place, and it exists because the ef cycle shipped the
// resolver with no caller: green unit tests over a tree nothing ever scanned.
//
// Scope is repo-wide by measurement, not by preference — 110 ms over 2110 tracked
// files, the same order as the index build that settled the corpus's own
// build-on-demand question (spec D5). Scoping to the touched slice would save
// nothing and would leave a dangling annotation in an untouched file silent forever.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { matchesGlob } from '../memory-index/index-io.mjs';
import { resolveAnnotation } from './refs.mjs';

// Backticks and quotes terminate the key so a token embedded in a markdown table
// cell or a string literal yields the key alone rather than its punctuation.
const ANNOTATION_TOKEN = /@([a-z-]+):([^\s`'"]+)/g;

// Three exclusions, each proven by a real false positive measured at spec time: the
// syntax table in docs/annotations.md, the `@decision:<key>` placeholder in an
// archived spec, and a deliberately-dangling key inside a test fixture.
const EXCLUDED_GLOBS = ['docs/**'];
const PLACEHOLDER_KEY = /[<>]/;

const EMPTY = { scanned: 0, resolved: [], dangling: [] };

function trackedFiles(rootDir) {
  try {
    return execFileSync('git', ['-C', rootDir, 'ls-files'], { encoding: 'utf8' })
      .split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    // A non-git project degrades to scanning nothing, matching the fail-open
    // contract every other memory consumer honours. Throwing here would break
    // `scout` on a tree that simply never ran `git init`.
    return [];
  }
}

function excludedGlobs(rootDir) {
  try {
    const project = JSON.parse(readFileSync(join(rootDir, '.claude', 'project.json'), 'utf8'));
    return [...EXCLUDED_GLOBS, ...(project?.tdd?.test_globs ?? [])];
  } catch {
    return EXCLUDED_GLOBS;
  }
}

function readable(rootDir, rel) {
  try {
    return readFileSync(join(rootDir, rel), 'utf8');
  } catch {
    return null;
  }
}

function* tokensIn(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    for (const [, verb, key] of lines[i].matchAll(ANNOTATION_TOKEN)) {
      if (!PLACEHOLDER_KEY.test(key)) yield { line: i + 1, verb, key };
    }
  }
}

export function scanAnnotations({ rootDir, memDir, files } = {}) {
  if (!rootDir || !memDir) return { ...EMPTY };
  const candidates = files ?? trackedFiles(rootDir);
  const excluded = excludedGlobs(rootDir);
  const inScope = (rel) => !excluded.some((glob) => matchesGlob(glob, rel));

  const report = { scanned: 0, resolved: [], dangling: [] };
  for (const rel of candidates.filter(inScope)) {
    const text = readable(rootDir, rel);
    if (text === null) continue;
    report.scanned += 1;
    for (const { line, verb, key } of tokensIn(text)) {
      const result = resolveAnnotation(memDir, `@${verb}:${key}`);
      if (result.key === null) continue;
      const where = { file: rel, line, verb, key };
      if (result.resolved) report.resolved.push({ ...where, hook: result.hook });
      else report.dangling.push(where);
    }
  }
  return report;
}
