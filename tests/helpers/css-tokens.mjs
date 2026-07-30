// Foundation — read the site stylesheet and extract declarations from it.
//
// Why this exists: five assertions in tests/site-redesign-proof-grid.test.mjs
// need the same three primitives — the stylesheet's current bytes, its bytes at
// HEAD, and the custom-property declarations inside each. Inlining `readFileSync`
// + `spawnSync('git', ...)` + declaration regexes into the suite would put raw
// I/O and pattern-matching next to the claims that consume them.
//
// This is deliberately NOT part of tests/helpers/html-ancestry.mjs: that module
// parses CSS *selectors* (which rules exist), this one parses *declarations*
// (what values they carry). Same file type, different question.
//
// Stdlib only — there is no CSS parser in the dependency tree, and these are
// declaration-level reads, not a parse of the full grammar.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { REPO_ROOT } from './site-build.mjs';

export const STYLESHEET_REL = 'site-src/assets/site.css';

/** The stylesheet as it stands in the working tree. */
export function readStylesheet() {
  return readFileSync(path.join(REPO_ROOT, STYLESHEET_REL), 'utf8');
}

/**
 * The stylesheet as committed at HEAD — the before-state baseline.
 *
 * The working tree carries unrelated uncommitted edits, so HEAD (not the tree)
 * is the only stable baseline for a "this declaration did not change" claim.
 */
export function readStylesheetAtHead() {
  const r = spawnSync('git', ['show', `HEAD:${STYLESHEET_REL}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`git show HEAD:${STYLESHEET_REL} failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

/**
 * Every `--name: value;` declaration in the sheet, as a name → value map.
 *
 * Later declarations win, matching the cascade for a repeated property, so a
 * token redefined further down reports the value that actually applies.
 */
export function customProperties(css) {
  const out = new Map();
  const re = /^\s*(--[\w-]+)\s*:\s*([^;]+);/gm;
  let m;
  while ((m = re.exec(css)) !== null) out.set(m[1], m[2].trim());
  return out;
}

/** One token's declared value, or undefined when the token is absent. */
export function tokenValue(css, name) {
  return customProperties(css).get(name);
}

/**
 * Colour literals that are NOT oklch — hex, rgb(), rgba(), hsl(), hsla().
 *
 * Returns `{ line, text, literal }` per hit so a failure can cite the exact
 * source line rather than just a count.
 */
export function nonOklchColorLiterals(css) {
  const literal = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/gi;
  const hits = [];
  css.split('\n').forEach((text, i) => {
    for (const m of text.matchAll(literal)) {
      hits.push({ line: i + 1, text: text.trim(), literal: m[0] });
    }
  });
  return hits;
}

/**
 * Lines present in `after` but not in `before`.
 *
 * A multiset difference, not a set difference: a line duplicated in `after` but
 * appearing once in `before` reports the surplus copy. Whitespace-only and
 * blank lines are dropped — they carry no claim.
 */
export function addedLines(before, after) {
  const remaining = new Map();
  for (const raw of before.split('\n')) {
    const key = raw.trim();
    if (!key) continue;
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const added = [];
  after.split('\n').forEach((raw, i) => {
    const key = raw.trim();
    if (!key) return;
    const left = remaining.get(key) ?? 0;
    if (left > 0) remaining.set(key, left - 1);
    else added.push({ line: i + 1, text: key });
  });
  return added;
}
