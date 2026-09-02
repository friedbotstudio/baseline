// Foundation — the single shared reader for a fact file's YAML-ish preamble.
// Used by build-index, scoped-memory, and migrate so the parse rule lives once.
// Deliberately minimal: scalar `key: value` and inline `[a, b]` arrays, which is
// the whole vocabulary the memory frontmatter uses. Not a general YAML engine.

function parseArray(raw) {
  return raw
    .slice(1, -1)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseScalar(raw) {
  if (raw.startsWith('[') && raw.endsWith(']')) return parseArray(raw);
  return raw;
}

function parsePreamble(preamble) {
  const frontmatter = {};
  for (const line of preamble.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // `key:value` with no space is accepted: two other readers of this same
    // frontmatter (harness/checkers/backlog-deferral.mjs, harness/proposal.mjs)
    // already accept it, and the two-character `: ` requirement silently
    // returned {} for an entry they parse. Widening, so nothing that parsed
    // before stops parsing.
    const sep = trimmed.indexOf(':');
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep);
    if (!key) continue;
    frontmatter[key] = parseScalar(trimmed.slice(sep + 1).trim());
  }
  return frontmatter;
}

export function parseFrontmatter(text) {
  if (typeof text !== 'string') throw new TypeError('parseFrontmatter: text must be a string');
  // `\r?\n`: a CRLF entry returned {frontmatter: {}, body: <whole file>} with no
  // error, while the two readers named above parsed it. Silent disagreement.
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  return { frontmatter: parsePreamble(match[1]), body: text.slice(match[0].length) };
}

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}
