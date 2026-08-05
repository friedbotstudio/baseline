// Orchestration — a view is a QUERY RESULT, never a stored artifact.
//
// Epic decision D3 stands: readAll().views stays empty and nothing writes a view
// file. That is what makes D3 permanently correct rather than provisionally so —
// views are output, so they never need a consumer to justify storage.
//
// composeView is pure and generateView spawns a JVM. The split is the
// Domain/Foundation boundary, and it is also what keeps AC-009 provable in the
// default test suite: rendering is opt-in behind PLANTUML_TESTS, so if composition
// were only reachable through generateView its sole coverage would be a skipped test.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { assertSafeFieldValue } from '../memory-index/migrate.mjs';
import { readShard, everyShardSection, elementIdFromSection } from './shards.mjs';
import { readRecords } from './store.mjs';

const HEADER = ['@startuml', '!include <C4/C4_Component>'];

// A section naming no element is refused rather than included: the corpus cannot
// say what it describes, and a diagram that silently shows an unknown box is worse
// than one that reports the gap.
export function findOrphanShards(memDir) {
  const known = new Set(readRecords(memDir, 'elements').map((el) => el.id));
  return everyShardSection(memDir)
    .filter(({ section }) => !known.has(elementIdFromSection(section)))
    .map(({ file, section }) => `${file}!${section}`);
}

function orderElements(ids, weights) {
  if (!weights) return [...ids];
  // Descending weight, then id, so the order is total and a view of equally-coupled
  // elements is still byte-stable between runs.
  return [...ids].sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0) || a.localeCompare(b));
}

export function composeView(memDir, { elements = [], weights = null, title = 'workspace view' } = {}) {
  // Security review 2026-08-05 (MEDIUM): an unvalidated newline here forged
  // arbitrary PlantUML directives into the generated document. Same rule, same
  // helper, and the same REJECT-never-normalize register that already bounds every
  // interpolated frontmatter field — a document assembled from parts is exactly as
  // forgeable as a record assembled from fields.
  assertSafeFieldValue('title', title);
  const lines = [...HEADER, `title ${title}`];
  for (const id of orderElements(elements, weights)) {
    const shard = readShard(memDir, id);
    if (!shard) continue;
    lines.push(`!includesub ${shard.path}!${shard.section}`);
  }
  lines.push('@enduml');
  return lines.join('\n') + '\n';
}

// The remote PlantUML server is deliberately NOT a fallback: it cannot resolve the
// local !includesub paths this composition depends on, so a fallback would render
// a silently different — and emptier — diagram than the one asked for.
export function generateView(memDir, query = {}, { jarPath } = {}) {
  if (!jarPath || !existsSync(jarPath)) {
    throw new Error(`plantuml jar not found at ${jarPath} — local rendering is required for !includesub composition`);
  }
  const wrapper = composeView(memDir, query);
  // `-pipe` gives PlantUML no base directory, so the wrapper's relative
  // `!includesub` paths resolve against the process working directory — running
  // from memDir is what makes them resolve. The jar path is made absolute FIRST,
  // because that same cwd switch would otherwise resolve a relative jar against
  // memDir and turn `.claude/bin/plantuml.jar` into "Unable to access jarfile".
  const result = spawnSync('java', ['-jar', resolve(jarPath), '-tsvg', '-pipe'], {
    input: wrapper,
    cwd: memDir,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw new Error(`plantuml render failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`plantuml render exited ${result.status}: ${String(result.stderr ?? '').slice(0, 400)}`);
  }
  return result.stdout;
}
