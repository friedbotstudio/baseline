#!/usr/bin/env node
// TDD Order Guard — PreToolUse(Write)
//
// When Claude creates a new source file (first write, file does not exist),
// require that a corresponding test file already exists. Enforces
// test-before-source TDD per seed.md § "TDD order guard".
//
// Applies only if .tdd.enabled is true in project.json. Skips edits to
// existing files. Honours source/test/exempt globs from project.json.

import { existsSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import {
  CLAUDE_PROJECT_ROOT,
  readPayload,
  payloadGet,
  projectGet,
  emitAllow,
  emitBlock,
  matchAnyGlob,
  logLine,
} from './lib/common.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (tool !== 'Write') emitAllow();

const enabled = projectGet('.tdd.enabled');
if (!(enabled === true || enabled === 'true' || enabled === 'True')) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();

// Only apply on file *creation*.
if (existsSync(file)) emitAllow();

const rel = relative(CLAUDE_PROJECT_ROOT, file) || file;

if (matchAnyGlob(rel, projectGet('.tdd.exempt_globs'))) emitAllow();
if (!matchAnyGlob(rel, projectGet('.tdd.source_globs'))) emitAllow();
if (matchAnyGlob(rel, projectGet('.tdd.test_globs'))) emitAllow();

const stem = basename(file);
const dotIdx = stem.lastIndexOf('.');
const name = dotIdx >= 0 ? stem.slice(0, dotIdx) : stem;
let ext = dotIdx >= 0 ? stem.slice(dotIdx + 1) : 'py';
const dir = dirname(rel);

// Extension family — when source is .js/.mjs/.cjs, tests may use any of
// the JS-ESM-family extensions. Same for .ts/.tsx/.mts/.cts.
const JS_FAMILY = new Set(['js', 'mjs', 'cjs']);
const TS_FAMILY = new Set(['ts', 'tsx', 'mts', 'cts']);
let extVariants;
if (JS_FAMILY.has(ext)) extVariants = [...JS_FAMILY];
else if (TS_FAMILY.has(ext)) extVariants = [...TS_FAMILY];
else extVariants = [ext];

// Strip a source-root prefix so candidates can mirror the layout under a
// parallel test-root: src/foo/bar.py → foo/bar.py.
let srcSubpath = rel;
for (const r of ['src/', 'lib/', 'app/', 'pkg/', 'internal/']) {
  if (rel.startsWith(r)) { srcSubpath = rel.slice(r.length); break; }
}
const srcSubpathNoExt = srcSubpath.replace(/\.[^./]+$/, '');

const testGlobs = projectGet('.tdd.test_globs') || [];
const suffixPatterns = []; // e.g. "_test", ".test", ".spec"
const prefixPatterns = []; // e.g. "test_"
const dirRoots = [];       // e.g. "tests", "spec", "__tests__"

for (const g of testGlobs) {
  if (typeof g !== 'string') continue;
  let m;
  // **/*<sep><word>.* → suffix
  if ((m = /^\*\*\/\*([._-][^*/.]+)\.\*$/.exec(g))) { suffixPatterns.push(m[1]); continue; }
  // **/<word>_*.* → prefix
  if ((m = /^\*\*\/([^*/.]+)_\*\.\*$/.exec(g))) { prefixPatterns.push(m[1] + '_'); continue; }
  // <dir>/** → directory root
  if ((m = /^([\w._-]+)\/\*\*$/.exec(g))) { dirRoots.push(m[1]); continue; }
}

// Backstops.
if (suffixPatterns.length === 0) suffixPatterns.push('_test', '.test', '.spec');
if (prefixPatterns.length === 0) prefixPatterns.push('test_');
if (dirRoots.length === 0) dirRoots.push('tests', 'test', 'spec', '__tests__');

const cands = new Set();
const add = (p) => cands.add(p.replace(/^\/+/, ''));

// Co-located beside source
for (const e of extVariants) {
  for (const s of suffixPatterns) add(`${dir}/${name}${s}.${e}`);
  for (const p of prefixPatterns) add(`${dir}/${p}${name}.${e}`);
}

// Under each dir-root
for (const d of dirRoots) {
  add(`${d}/${srcSubpath}`); // mirror layout
  for (const e of extVariants) {
    add(`${d}/${name}.${e}`);
    for (const s of suffixPatterns) {
      add(`${d}/${name}${s}.${e}`);
      add(`${d}/${srcSubpathNoExt}${s}.${e}`);
    }
    for (const p of prefixPatterns) {
      add(`${d}/${p}${name}.${e}`);
      add(`${d}/${p}${srcSubpathNoExt}.${e}`);
    }
  }
}

// Co-located inside __tests__-style subdirs (Jest)
for (const d of dirRoots) {
  if (d.startsWith('_') || d === '__tests__') {
    for (const e of extVariants) {
      for (const s of suffixPatterns) add(`${dir}/${d}/${name}${s}.${e}`);
    }
  }
}

let found = '';
for (const c of [...cands].sort()) {
  if (!c) continue;
  if (existsSync(join(CLAUDE_PROJECT_ROOT, c))) { found = c; break; }
}

if (found) {
  logLine('tdd_order_guard', `ALLOWED test exists: ${found} for ${rel}`);
  emitAllow();
}

logLine('tdd_order_guard', `BLOCKED no test for: ${rel}`);
emitBlock(`TDD Order Guard: no test file found for new source '${rel}'. Write the failing test first. Candidates were derived from project.json → tdd.test_globs (e.g. tests/${name}_test.${ext}, ${dir}/${name}_test.${ext}, tests/${srcSubpathNoExt || name}.${ext}). If this file truly has no tests by design, add the path to .tdd.exempt_globs in .claude/project.json.`);
