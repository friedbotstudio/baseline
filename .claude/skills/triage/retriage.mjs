// retriage — read the open backlog, then materialize a human-confirmed grouping
// as an epic. The grouping itself is binding judgment and stays in main context
// (Article II); this module only gathers, and writes what the human confirmed.

import { writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { epicStateFor, workflowFor } from './retriage-records.mjs';
import { join } from 'node:path';

import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { parseShard, summarize, splitList } from './backlog-shard.mjs';

// --- Domain: the open backlog ------------------------------------------------

export function collectOpenBacklog({ memoryDir } = {}) {
  const dir = join(memoryDir ?? '', 'backlog');
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.md')).sort();
  } catch {
    return [];
  }

  const entries = [];
  for (const name of names) {
    const path = join(dir, name);
    let shard;
    try {
      shard = parseShard(path);
    } catch {
      continue;
    }
    if (!shard || shard.fields.get('status') !== 'open') continue;
    entries.push({
      key: shard.fields.get('key') ?? name.slice(0, -'.md'.length),
      path,
      governs: splitList(shard.fields.get('governs')),
      raisedIn: shard.fields.get('raised-in-context') ?? '',
      summary: summarize(shard.body),
    });
  }
  return entries;
}

export function materializeRetriagedEpic({ rootDir, proposal } = {}) {
  const { epicSlug, slices } = proposal ?? {};
  assertSafeSlug(epicSlug, 'epic slug');
  if (!Array.isArray(slices) || slices.length === 0) {
    throw new Error('retriage: the proposal declares no slices; an epic needs at least one');
  }

  const workflowPath = join(rootDir, '.claude/state/workflow.json');
  if (existsSync(workflowPath)) {
    throw new Error(`retriage: a workflow is already live at ${workflowPath}; finish or clear it first`);
  }

  const epicStatePath = join(rootDir, '.claude/state/epic', `${epicSlug}.json`);
  mkdirSync(join(rootDir, '.claude/state/epic'), { recursive: true });
  writeFileSync(epicStatePath, `${JSON.stringify(epicStateFor(proposal), null, 2)}\n`, 'utf8');
  writeFileSync(workflowPath, `${JSON.stringify(workflowFor(proposal), null, 2)}\n`, 'utf8');

  return { workflowPath, epicStatePath };
}
