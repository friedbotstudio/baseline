// Foundation — backlog closure stamp reader + staged-tree obligation evaluator.
// Shared single source of truth (spec D3) imported by git_commit_guard.mjs
// (hard-block enforcement) and .claude/skills/commit/closure-precommit-check.mjs
// (SOP preflight). Pure: no git, no I/O — callers inject staged content.

import { parseFrontmatter } from './frontmatter-parser.mjs';

const BACKLOG_REL = '.claude/memory/backlog.md';
const BACKLOG_DIR = '.claude/memory/backlog/';

// Read from the entry's frontmatter BLOCK, never from anywhere in the file.
// Matching `^status: picked-up$` against the whole text let an entry whose
// frontmatter read `status: open` satisfy the commit obligation as long as its
// body quoted the two stamp lines while discussing them. `git_commit_guard`
// hard-blocks on this reader, so a prose-satisfiable stamp is a commit-path
// defect. Measured at 02f3c68.
export function hasClosureStamp(text) {
  const { frontmatter } = parseFrontmatter(String(text || ''));
  return frontmatter.status === 'picked-up' && Boolean(frontmatter['superseded-at']);
}

function frontmatterKey(text) {
  const { frontmatter } = parseFrontmatter(String(text || ''));
  const key = frontmatter.key;
  return typeof key === 'string' && key ? key.trim() : null;
}

// Sharded store: a staged `backlog/<slug>.md` whose frontmatter `key:` matches and
// carries the `status: picked-up` + `superseded-at:` stamp satisfies the obligation.
function stagedShardedStamps(stagedPaths, readStaged) {
  const byKey = {};
  for (const path of stagedPaths) {
    if (!path.startsWith(BACKLOG_DIR) || !path.endsWith('.md')) continue;
    const text = readStaged(path) || '';
    const key = frontmatterKey(text);
    if (key) byKey[key] = text;
  }
  return byKey;
}

function entryBlock(backlogText, key) {
  const blocks = String(backlogText || '').split(/^## /m);
  for (const block of blocks) {
    const firstLine = block.split('\n', 1)[0].trim();
    if (firstLine === key) return block;
  }
  return null;
}

function isStamped(block) {
  return /^- status:\s*picked-up\s*$/m.test(block) && /^- superseded-at:\s*\S/m.test(block);
}

// Keys that are NOT closed in the given backlog text (absent, or present but
// missing the picked-up status / superseded-at stamp).
export function unsatisfiedKeys(backlogText, keys) {
  return keys.filter((key) => {
    const block = entryBlock(backlogText, key);
    return block === null || !isStamped(block);
  });
}

function stagedWorkflowKeys(stagedPaths, readStaged) {
  const keys = new Set();
  for (const path of stagedPaths) {
    if (!path.endsWith('workflow.json')) continue;
    const raw = readStaged(path);
    if (!raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    for (const key of parsed.source_backlog_keys || []) keys.add(key);
  }
  return [...keys];
}

// Given the staged paths and a reader of staged content (`git show :<path>`),
// decide whether this commit's closure obligation is satisfied.
export function evaluateClosure({ stagedPaths, readStaged }) {
  const keys = stagedWorkflowKeys(stagedPaths, readStaged);
  if (keys.length === 0) return { block: false, unsatisfied: [], reason: null };

  const flatStaged = stagedPaths.includes(BACKLOG_REL);
  const flatText = flatStaged ? (readStaged(BACKLOG_REL) || '') : '';
  const sharded = stagedShardedStamps(stagedPaths, readStaged);

  const unsatisfied = keys.filter((key) => {
    if (sharded[key] && hasClosureStamp(sharded[key])) return false;
    if (flatStaged) {
      const block = entryBlock(flatText, key);
      if (block && isStamped(block)) return false;
    }
    return true;
  });

  if (unsatisfied.length === 0) return { block: false, unsatisfied: [], reason: null };

  const anyStagedBacklog = flatStaged || Object.keys(sharded).length > 0;
  const detail = anyStagedBacklog
    ? `stamp them picked-up + superseded-at (flat \`backlog.md\` block, or sharded \`backlog/<key>.md\` frontmatter)`
    : `stage the backlog entry (flat \`${BACKLOG_REL}\` or sharded \`${BACKLOG_DIR}<key>.md\`) in this same commit`;
  return {
    block: true,
    unsatisfied,
    reason: `closure obligation unmet for [${unsatisfied.join(', ')}] — ${detail}`,
  };
}
