// retriage — read the open backlog, then materialize a human-confirmed grouping
// as an epic. The grouping itself is binding judgment and stays in main context
// (Article II); this module only gathers, and writes what the human confirmed.

import { writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
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

// --- Domain: the confirmed grouping ------------------------------------------

function absorbedKeys(slices) {
  return [...new Set(slices.flatMap((slice) => slice.backlogKeys ?? []))];
}

function epicStateFor({ epicSlug, slices }) {
  return {
    epic: epicSlug,
    spec: `docs/specs/${epicSlug}.md`,
    scout: `docs/scout/${epicSlug}.md`,
    research: `docs/research/${epicSlug}.md`,
    slices: slices.map(({ id, title, acs }) => ({ id, title, acs: acs ?? [], risk: [] })),
    approved: false,
    children: [],
  };
}

function workflowFor({ epicSlug, title, slices }) {
  const keys = absorbedKeys(slices);
  const now = Math.floor(Date.now() / 1000);
  return {
    request: `Epic ${title}, retriaged from ${keys.length} open backlog entries.`,
    slug: epicSlug,
    track_id: 'epic',
    novelty: 'spec-derived',
    novelty_evidence: `Grouped from open backlog entries: ${keys.join(', ')}.`,
    skip_brainstorm: true,
    exceptions: [],
    completed: [],
    skipped_alternates: [],
    source_backlog_keys: keys,
    created_at: now,
    updated_at: now,
  };
}

// --- Orchestration: write only what the human confirmed ----------------------

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
