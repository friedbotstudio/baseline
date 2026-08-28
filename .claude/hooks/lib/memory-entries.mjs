import { asList } from '../../skills/memory-index/categories.mjs';

// Foundation — the one definition of how a flat memory file splits into entries,
// and of where an entry surfaces.
//
// Four private copies drifted twice: splitBlocks keyed on the first whitespace token
// while the other three took the whole heading (one entry, two names), and only
// shape.splitFlatIntoRecords knew a body may carry its own `## ` line — the naive
// split cost 4 spurious shards and 2 field-stripped parents on the live store
// (measured 2026-08-14).

// Every block is a byte-exact substring of its body. sweep's replaceBlock/deleteBlock
// locate one with `text.indexOf(block)` and return the text UNCHANGED on a miss, so a
// normalized block does not throw — memory-sync just stops writing, silently. Hence
// slicing, never rebuilding from lines.
const ENTRY_HEADING = /(^##\s+\S.*)$/m;

function lineAt(text, offset) {
  const breakAt = text.indexOf('\n', offset);
  const end = breakAt < 0 ? text.length : breakAt;
  return { line: text.slice(offset, end), breakAt };
}

// Line-anchored `^---$` rather than a substring search: a horizontal rule in the
// body reads as a close to `indexOf('---')` and silently truncates the file.
export function stripFrontmatter(text) {
  if (!text.startsWith('---')) return text;
  const opening = lineAt(text, 0);
  if (opening.line.trim() !== '---' || opening.breakAt < 0) return text;
  let offset = opening.breakAt + 1;
  while (offset <= text.length) {
    const { line, breakAt } = lineAt(text, offset);
    if (line.trim() === '---') return breakAt < 0 ? '' : text.slice(breakAt + 1);
    if (breakAt < 0) return text;
    offset = breakAt + 1;
  }
  return text;
}

export function entryKeyFromHeading(headingLine) {
  return headingLine.replace(/^##\s+/, '').trim();
}

// Where an entry surfaces — a different question from what re-verifies it (`governs:`,
// read by the staleness predicate). Surfacing wants a wide answer and staleness a
// narrow one, so one field could not serve both. Both surfacing mechanisms resolve
// through here; applying this precedence at two sites is how they drifted before.
//
// First NON-EMPTY wins: an empty `surfaces-on:` must never shadow a populated
// `governs:`, or absence stops being inert and this stops being additive. The key
// fallback stays LAST and is load-bearing — only 8 of 92 category-default landmarks
// declare a path field, so the other 84 are filterable through this line alone.
export function surfacingPathsOf(entry) {
  const audience = asList(entry?.fields?.['surfaces-on']);
  if (audience.length) return audience;

  const governed = asList(entry?.fields?.governs);
  if (governed.length) return governed;

  const key = entry?.key;
  if (typeof key !== 'string' || !key.includes('/')) return [];
  return [key.replace(/:\d+$/, '')];
}

// Takes a body with frontmatter ALREADY stripped — stripping inside would double-strip
// a body that legitimately opens with `---`, so the caller composes the two.
//
// `knownKeys` is the authority for what opens an entry. Omit it and every heading opens
// one, which is the honest answer for a flat store: its entries ARE its headings.
export function splitFlatEntries(body, { knownKeys = null } = {}) {
  const parts = body.split(ENTRY_HEADING);
  const known = knownKeys ? new Set(knownKeys) : null;
  const entries = [];
  for (let i = 1; i < parts.length; i += 2) {
    const chunk = parts[i] + (parts[i + 1] ?? '');
    const key = entryKeyFromHeading(parts[i]);
    const belongsToPrevious = known && entries.length > 0 && !known.has(key);
    if (belongsToPrevious) entries[entries.length - 1][1] += chunk;
    else entries.push([key, chunk]);
  }
  return entries;
}
