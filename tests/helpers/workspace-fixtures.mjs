// Foundation — fixtures for the workspace structural corpus (living-system-model
// E1/E2/E3).
//
// A SEPARATE module from memory-fixtures.mjs, for the same reason
// memory-git-fixtures.mjs is separate: that file is already past the ~80-line
// code-structure ceiling, and the corpus is a distinct responsibility.
//
// The distinction this module exists to keep visible: the workspace lives UNDER
// .claude/memory/ but is deliberately NOT a ninth canonical category, so
// everyShardFile() must never walk it. Keeping its fixtures out of the category
// fixtures module is what stops a future contributor from wiring it into CANONICAL
// by reflex.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function makeWorkspace(memDir) {
  const dir = join(memDir, 'workspace', 'elements');
  mkdirSync(dir, { recursive: true });
  return dir;
}

// `fields` land in frontmatter; kind/title/anchor carry defaults so a test only
// states the attribute it is actually exercising.
export function writeWorkspaceElement(memDir, id, fields = {}, bodyLines = []) {
  const dir = makeWorkspace(memDir);
  const { kind = 'component', title = id, anchor = `.claude/skills/${id}/**`, ...rest } = fields;
  const preamble = [
    `id: ${id}`,
    `kind: ${kind}`,
    `title: ${title}`,
    `anchor: ${anchor}`,
    ...Object.entries(rest).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(',') : v}`),
  ];
  const path = join(dir, `${id}.md`);
  writeFileSync(path, `---\n${preamble.join('\n')}\n---\n\n${bodyLines.join('\n')}\n`, 'utf8');
  return path;
}

export function seedCorpus(memDir, count) {
  makeWorkspace(memDir);
  const paths = [];
  for (let i = 0; i < count; i++) {
    paths.push(writeWorkspaceElement(memDir, `el-${i}`, { anchor: `area-${i}/**` }));
  }
  return paths;
}
