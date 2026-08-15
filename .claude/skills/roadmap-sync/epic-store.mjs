// Foundation — the two stores the epic backfill reads: the declared roadmap path
// and the per-epic discovery state. Every reader degrades to a null or an empty
// list rather than throwing, because the backfill runs inside a commit path.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { resolveRoadmapPath } from './sync.mjs';

export function readRoadmapPath(rootDir) {
  try {
    const cfg = JSON.parse(readFileSync(join(rootDir, '.claude/project.json'), 'utf8'));
    return resolveRoadmapPath(cfg?.roadmap?.path, rootDir);
  } catch {
    return null;
  }
}

export function readEpicStates(rootDir, slugs) {
  const dir = join(rootDir, '.claude/state/epic');
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return [];
  }

  const wanted = Array.isArray(slugs) && slugs.length > 0 ? new Set(slugs) : null;
  return names
    .map((name) => ({ slug: name.slice(0, -'.json'.length), path: join(dir, name) }))
    .filter((entry) => !wanted || wanted.has(entry.slug))
    .map((entry) => {
      try {
        return { ...entry, state: JSON.parse(readFileSync(entry.path, 'utf8')) };
      } catch {
        return { ...entry, state: null };
      }
    });
}

export function stampEpicNumber(path, state, num) {
  const next = { ...state, roadmap_epic: num, updated_at: Math.floor(Date.now() / 1000) };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}
