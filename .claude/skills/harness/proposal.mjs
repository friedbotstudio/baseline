// Domain — candidate work, and the one path that writes it.
//
// Reading and proposing are separate from applying because AC-010 turns on exactly
// that separation: a proposal the operator has not seen must not have changed
// anything, and "adds nothing" in AC-011 means the file is byte-identical.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic } from '../../hooks/lib/common.mjs';

const workflowPath = (rootDir) => join(rootDir, '.claude/state/workflow.json');

function readWorkflow(rootDir) {
  const path = workflowPath(rootDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// workflow.json is the durable truth across sessions (Article V), so a torn write
// costs a landing its completed[] and its source_backlog_keys. writeJsonAtomic
// already does write-to-temp-then-rename with temp cleanup.
function writeWorkflow(rootDir, workflow) {
  workflow.updated_at = Math.floor(Date.now() / 1000);
  writeJsonAtomic(workflowPath(rootDir), workflow);
}

function openBacklogEntries(rootDir) {
  const dir = join(rootDir, '.claude/memory/backlog');
  if (!existsSync(dir)) return [];

  const entries = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const body = readFileSync(join(dir, name), 'utf8');
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)?.[1] ?? '';
    if (!/^status:\s*open\s*$/m.test(frontmatter)) continue;

    entries.push({
      key: /^key:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim() ?? name.replace(/\.md$/, ''),
      title: /^-\s*(.+)$/m.exec(body.slice(frontmatter.length))?.[1]?.trim() ?? '',
    });
  }
  return entries;
}

// Reads only. The operator has not been asked yet, and a proposal that wrote would
// be the auto-add AC-010 forbids.
export function proposeWork({ rootDir, shortfallTokens, perEntryTokens = 8000 }) {
  const wanted = Math.max(1, Math.ceil(shortfallTokens / perEntryTokens));
  const pool = openBacklogEntries(rootDir);

  const candidates = pool.slice(0, wanted).map((entry) => ({
    key: entry.key,
    title: entry.title,
    estimated_tokens: perEntryTokens,
    ready: true,
  }));

  return { candidates, covers_tokens: candidates.length * perEntryTokens, approved: false, pool_size: pool.length };
}

export function applyProposal({ rootDir, proposal, approved }) {
  if (!approved) return { written: false, keys: [] };

  const workflow = readWorkflow(rootDir);
  if (!workflow) return { written: false, keys: [] };

  const keys = proposal.candidates.map((c) => c.key);
  workflow.source_backlog_keys = [...new Set([...(workflow.source_backlog_keys ?? []), ...keys])];
  writeWorkflow(rootDir, workflow);

  return { written: true, keys };
}

// A bypass nobody can count teaches worse habits than no floor at all, so the reason
// is recorded beside the flag and rides into the archived bundle.
export function recordOverride({ rootDir, reason }) {
  const workflow = readWorkflow(rootDir);
  if (!workflow) return false;

  workflow.work_planner = {
    ...(workflow.work_planner ?? {}),
    override: true,
    override_reason: typeof reason === 'string' ? reason : '',
  };
  writeWorkflow(rootDir, workflow);
  return true;
}

export { readWorkflow };
