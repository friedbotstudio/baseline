// Foundation — the record wire format: frontmatter in, frontmatter out.
//
// Split out of store.mjs so the codec can be read and changed without scrolling
// past filesystem code. Deliberately NOT replaced by hooks/lib/frontmatter-parser:
// that parser returns parsed scalars, while a corpus record needs the RAW field
// lines so LIST_FIELDS can be split into arrays and everything else kept verbatim.
// Two parsers with different contracts is correct here; collapsing them would
// silently change what a record round-trips to.

import { asList } from '../memory-index/categories.mjs';
import { assertSafeFieldValue } from '../memory-index/migrate.mjs';

const LIST_FIELDS = new Set(['governed_by', 'rests_on', 'includes', 'members']);
const RECORD_DEFAULTS = { kind: 'component', anchor: '', members: [] };

// Bounded to the leading block: an unanchored scan would read a BODY line shaped
// like a field as frontmatter, the same defect security review F-2 found in
// resolve.mjs.
export function splitFrontmatter(text) {
  const lines = String(text).split('\n');
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return { front: lines.slice(1, i), body: lines.slice(i + 1).join('\n') };
    }
  }
  return null;
}

export function parseEntry(text) {
  const split = splitFrontmatter(text);
  if (!split) return null;
  const fields = {};
  for (const line of split.front) {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (!match) continue;
    const [, name, raw] = match;
    fields[name] = LIST_FIELDS.has(name) ? asList(raw) : raw.trim();
  }
  return fields.id ? { ...fields, body: split.body } : null;
}

// `order` names the fields that lead the frontmatter and get a default. A concept
// passes ['kind','title','members'] and therefore never renders an `anchor:` —
// granularity is derived from anchor SHAPE (spec D1), so a concept carrying an
// empty anchor would be read as a component.
export function renderRecord(record, order = ['kind', 'title', 'anchor']) {
  const { id, body = '', ...given } = record;
  const fields = order.map((name) => [
    name,
    given[name] ?? (name === 'title' ? id : RECORD_DEFAULTS[name] ?? ''),
  ]);
  for (const [name, value] of Object.entries(given)) {
    if (!order.includes(name)) fields.push([name, value]);
  }
  // `id` is already bounded by assertSafeFactKey; every other name and value is
  // interpolated straight into line-delimited frontmatter (security review F-2).
  const front = [`id: ${id}`];
  for (const [name, value] of fields) {
    assertSafeFieldValue(name, value);
    front.push(`${name}: ${value}`);
  }
  return `---\n${front.join('\n')}\n---\n\n${body}\n`;
}
