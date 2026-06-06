// Foundation — backlog closure stamp reader + staged-tree obligation evaluator.
// Shared single source of truth (spec D3) imported by git_commit_guard.mjs
// (hard-block enforcement) and .claude/skills/commit/closure-precommit-check.mjs
// (SOP preflight). Pure: no git, no I/O — callers inject staged content.

const BACKLOG_REL = '.claude/memory/backlog.md';

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

  const backlogStaged = stagedPaths.includes(BACKLOG_REL);
  const unsatisfied = backlogStaged
    ? unsatisfiedKeys(readStaged(BACKLOG_REL) || '', keys)
    : [...keys];

  if (unsatisfied.length === 0) return { block: false, unsatisfied: [], reason: null };

  const detail = backlogStaged
    ? `stamp them picked-up + superseded-at`
    : `stage ${BACKLOG_REL} in this same commit`;
  return {
    block: true,
    unsatisfied,
    reason: `closure obligation unmet for [${unsatisfied.join(', ')}] — ${detail}`,
  };
}
