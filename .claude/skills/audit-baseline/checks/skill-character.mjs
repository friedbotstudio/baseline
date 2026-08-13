// Character blocks — presence, completeness, and drift against the doctrine
// (Article XI, spec skill-character-doctrine).
//
// The target set comes from the doctrine's key set, never from `owner:` frontmatter:
// one target is dev-only by design, and annotating it would ship a maintainer tool
// and force a derived-count cascade (intake D-4).

import { existsSync, readFileSync } from 'node:fs';

import { loadDoctrine, renderBlock, extractBlock, skillPathFor } from '../character.mjs';

const PARTS = [['soul', 'Soul'], ['motivation', 'Motivation'], ['mantra', 'Mantra']];

export function run(ctx) {
  const rows = [];
  const add = (slug, detail) => rows.push([`skill character: ${slug}`, 'FAIL', detail]);

  let doctrine;
  try {
    doctrine = loadDoctrine(ctx.root);
  } catch (error) {
    return [['skill character: doctrine', 'FAIL', error.message]];
  }

  for (const [slug, entry] of Object.entries(doctrine.skills).sort()) {
    const path = skillPathFor(ctx.root, slug);
    if (!existsSync(path)) continue;
    const detail = inspect(readFileSync(path, 'utf8'), entry);
    if (detail) add(slug, detail);
  }
  return rows;
}

function inspect(skillText, entry) {
  const found = extractBlock(skillText);
  if (!found) return 'no character block';

  const missing = PARTS.find(([, label]) => !new RegExp(`^- \\*\\*${label}\\.\\*\\* \\S`, 'm').test(found.text));
  if (missing) return `character block missing ${missing[0]}`;

  let expected;
  try {
    expected = renderBlock(entry);
  } catch (error) {
    return `doctrine entry invalid: ${error.message}`;
  }
  return found.text === expected ? null : 'character block drifted from doctrine';
}
