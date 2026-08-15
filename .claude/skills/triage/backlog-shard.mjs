// Foundation — one backlog shard on disk: its frontmatter fields and the first
// body bullet that serves as its summary. Parsing is lenient by design; a shard
// that will not parse is skipped by the caller rather than failing the read.

import { readFileSync } from 'node:fs';

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

export function parseShard(path) {
  const raw = readFileSync(path, 'utf8');
  const matched = FRONTMATTER.exec(raw);
  if (!matched) return null;

  const fields = new Map();
  for (const line of matched[1].split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) fields.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  return { fields, body: raw.slice(matched[0].length) };
}

export function summarize(body) {
  const line = body.split('\n').find((l) => l.trim().startsWith('-'));
  return line ? line.replace(/^\s*-\s*/, '').replace(/\*\*/g, '').trim() : '';
}

export function splitList(value) {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}
