// Pure surface-check helpers — cross-check a count literal in a prose surface,
// a skills byCategory sum, a docsite section slice, and docsite table coverage.
// Foundation layer: no shared state, exported for unit tests and re-exported by
// audit.mjs for the governance suite's existing import path.
import { existsSync, readFileSync } from 'node:fs';

const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, 'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23,
  'twenty-four': 24, 'twenty-five': 25, 'twenty-six': 26, 'twenty-seven': 27, 'twenty-eight': 28,
  'twenty-nine': 29, thirty: 30, 'thirty-one': 31, 'thirty-two': 32, 'thirty-three': 33,
  'thirty-four': 34, 'thirty-five': 35, 'thirty-six': 36, 'thirty-seven': 37, 'thirty-eight': 38,
  'thirty-nine': 39, forty: 40, 'forty-one': 41, 'forty-two': 42,
};

// Parse a numeric literal or spelled-out number word to an integer, else null.
export function toInt(s) {
  const t = (s || '').trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return Object.prototype.hasOwnProperty.call(WORDS, t) ? WORDS[t] : null;
}

// Cross-check a single count literal in a prose surface against the derived
// truth. WARN (never silent-pass) when the literal cannot be extracted, so a
// regex that stops matching surfaces as a signal rather than a false PASS.
export function checkSurfaceCount(file, regex, expected) {
  if (!existsSync(file)) return { status: 'WARN', detail: `surface missing: ${file}` };
  const m = readFileSync(file, 'utf8').match(regex);
  if (!m) return { status: 'WARN', detail: 'count literal not found (unextractable)' };
  const got = toInt(m[1]);
  if (got === null) return { status: 'WARN', detail: `unparseable literal "${m[1]}"` };
  return got === expected
    ? { status: 'PASS', detail: `${got}` }
    : { status: 'FAIL', detail: `expected ${expected}, found ${m[1]}` };
}

// Assert a skills category breakdown adds up to the skills total.
export function checkByCategorySum(byCategory, total) {
  const sum = Object.values(byCategory).reduce((a, b) => a + b, 0);
  return sum === total
    ? { status: 'PASS', detail: `sum ${sum} == total ${total}` }
    : { status: 'FAIL', detail: `byCategory sum ${sum} != skills total ${total}` };
}

// sectionSlice / checkDocsiteTracks / checkDocsiteHookTable were removed on
// 2026-07-29. They scanned `site-src/*.njk` for literal hook and track names,
// which the docsite stopped containing once those pages started building their
// rosters from a `{% for %}` over _data. checks/docsite-drift.mjs replaced them
// and asserts against the rendered tree instead; nothing else consumed them.
