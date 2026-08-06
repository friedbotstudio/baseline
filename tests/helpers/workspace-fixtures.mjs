// Foundation — fixtures for the workspace structural corpus (living-system-model
// E1/E2/E3).
//
// A SEPARATE module from memory-fixtures.mjs, for the same reason
// memory-git-fixtures.mjs is separate: that file is already past the ~80-line
// code-structure ceiling, and the corpus is a distinct responsibility.
//
// The distinction this module exists to keep visible: the corpus is a docs/ SPEC
// artifact, not a ninth canonical category, so everyShardFile() must never walk it.
// These fixtures take specDir; the category fixtures take memDir. Keeping the two
// modules apart is what stops a future contributor from conflating the roots — a
// corpus helper handed a memDir finds no records and fails silently.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function makeWorkspace(specDir) {
  const dir = join(specDir, 'elements');
  mkdirSync(dir, { recursive: true });
  return dir;
}

// `fields` land in frontmatter; kind/title/anchor carry defaults so a test only
// states the attribute it is actually exercising.
export function writeWorkspaceElement(specDir, id, fields = {}, bodyLines = []) {
  const dir = makeWorkspace(specDir);
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

export function seedCorpus(specDir, count) {
  makeWorkspace(specDir);
  const paths = [];
  for (let i = 0; i < count; i++) {
    paths.push(writeWorkspaceElement(specDir, `el-${i}`, { anchor: `area-${i}/**` }));
  }
  return paths;
}

// ─── architecture-map: concept layer + diagram shards ───
//
// Concepts sit BESIDE elements, not above them in the same directory: a concept
// carries no anchor (spec D1), so a reader that finds one in elements/ would
// classify it by anchor shape and get `component`. Separate directories keep the
// "granularity is derived from anchor shape" rule total.

export function makeConcepts(specDir) {
  const dir = join(specDir, 'concepts');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeWorkspaceConcept(specDir, id, fields = {}, bodyLines = []) {
  const dir = makeConcepts(specDir);
  const { title = id, members = [], ...rest } = fields;
  const preamble = [
    `id: ${id}`,
    'kind: concept',
    `title: ${title}`,
    `members: ${Array.isArray(members) ? members.join(',') : members}`,
    ...Object.entries(rest).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(',') : v}`),
  ];
  const path = join(dir, `${id}.md`);
  writeFileSync(path, `---\n${preamble.join('\n')}\n---\n\n${bodyLines.join('\n')}\n`, 'utf8');
  return path;
}

export function makeDiagrams(specDir) {
  const dir = join(specDir, 'diagrams');
  mkdirSync(dir, { recursive: true });
  return dir;
}

// A shard is a PlantUML fragment whose model is delimited by `!startsub <id>`.
// The section name IS the join key to the element record (spec D6), so the
// default writes `id` into both places — a test that wants an ORPHAN passes an
// explicit `section` that no element matches.
export function writeWorkspaceShard(specDir, id, { section = id, lines = [] } = {}) {
  const dir = makeDiagrams(specDir);
  const body = lines.length ? lines : [`Component(${id}, "${id}", "Node ESM", "fixture")`];
  const path = join(dir, `${id}.puml`);
  writeFileSync(path, `!startsub ${section}\n${body.join('\n')}\n!endsub\n`, 'utf8');
  return path;
}
