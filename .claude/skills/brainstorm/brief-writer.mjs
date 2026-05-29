// Foundation — Stage 3 brief persistence (AC-004). Writes docs/brief/<slug>.md
// with the six canonical fields in stable order. Markdown is human-readable
// and archivable. Pure filesystem operation.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const FIELD_ORDER = [
  'actor',
  'trigger',
  'current_state',
  'desired_state',
  'non_goals',
  'solution_leakage',
];

function titleCase(snake) {
  return snake.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return ['- *(none)*'];
    return value.map((item) => `- ${typeof item === 'string' ? item : JSON.stringify(item)}`);
  }
  if (value === undefined || value === null || value === '') {
    return ['*(not captured)*'];
  }
  return [String(value)];
}

export async function writeBrief({ outPath, slug, fields }) {
  await mkdir(dirname(outPath), { recursive: true });
  const lines = [`# Brainstorm brief — ${slug}`, ''];
  for (const field of FIELD_ORDER) {
    lines.push(`## ${titleCase(field)}`, '');
    lines.push(...renderValue(fields?.[field]));
    lines.push('');
  }
  await writeFile(outPath, lines.join('\n'));
  return { brief_path: outPath };
}
