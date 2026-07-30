// Foundation layer: answer "which classes are above this element?" on rendered
// HTML without a DOM library (the repo ships no jsdom, and this check must run
// in CI on the same zero-runtime-dep footing as everything else).
//
// It exists for one bug class. A CSS rule written `.hero .meta-strip { … }` is
// silently dead the moment the markup moves .meta-strip out of .hero — no build
// error, no failing test, no console warning. The rendered page just loses the
// styling. Catching it needs containment, not text matching, so this walks the
// tag stream and records each element's ancestor classes.

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// Skips comments, doctype, and the raw-text contents of script/style so a class
// name mentioned inside inline JS or CSS never registers as an element.
const TAG_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/gi;
const CLASS_RE = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const RAW_TEXT = new Set(['script', 'style']);

function classesOf(attrs) {
  const m = CLASS_RE.exec(attrs || '');
  if (!m) return [];
  return (m[1] ?? m[2] ?? m[3] ?? '').trim().split(/\s+/).filter(Boolean);
}

/**
 * Every class-bearing element in `html`, each with the set of classes carried by
 * its ancestors. Malformed nesting degrades gracefully: a stray close tag pops
 * to its matching open when there is one and is ignored otherwise, so a single
 * unbalanced tag cannot cascade into a wrong answer for the rest of the document.
 *
 * @returns {Array<{ classes: string[], ancestors: Set<string> }>}
 */
export function elementsWithAncestry(html) {
  const out = [];
  const stack = [];
  let rawTextUntil = null;

  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(html)) !== null) {
    const [, closing, rawName, attrs, selfClose] = m;
    if (!rawName) continue; // comment / doctype / CDATA
    const name = rawName.toLowerCase();

    if (rawTextUntil) {
      if (closing && name === rawTextUntil) rawTextUntil = null;
      continue;
    }

    if (closing) {
      const at = stack.map((f) => f.name).lastIndexOf(name);
      if (at !== -1) stack.length = at;
      continue;
    }

    const classes = classesOf(attrs);
    if (classes.length) {
      const ancestors = new Set();
      for (const frame of stack) for (const c of frame.classes) ancestors.add(c);
      out.push({ classes, ancestors });
    }

    if (VOID_ELEMENTS.has(name) || selfClose) continue;
    if (RAW_TEXT.has(name)) { rawTextUntil = name; continue; }
    stack.push({ name, classes });
  }

  return out;
}

/**
 * Descendant-combinator class pairs in a stylesheet: `.a .b` yields
 * { ancestor: 'a', descendant: 'b', selector: '.a .b' }.
 *
 * Deliberately narrow. It reads only selectors that are a plain class followed
 * by whitespace and another plain class, because that is the shape that fails
 * silently. Child/sibling combinators, attribute selectors, pseudo-classes and
 * compound selectors are skipped rather than guessed at — a false positive here
 * would train people to ignore the check.
 */
export function descendantClassPairs(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const pairs = new Map();

  for (const block of withoutComments.split('}')) {
    const head = block.slice(block.lastIndexOf('{') === -1 ? 0 : 0, block.indexOf('{'));
    if (block.indexOf('{') === -1) continue;
    for (const raw of head.split(',')) {
      const sel = raw.trim().replace(/\s+/g, ' ');
      const m = /^\.([A-Za-z0-9_-]+) \.([A-Za-z0-9_-]+)$/.exec(sel);
      if (!m) continue;
      pairs.set(sel, { ancestor: m[1], descendant: m[2], selector: sel });
    }
  }

  return [...pairs.values()];
}
