// Domain — parses the execution roadmap into a typed RoadmapPlan.
//
// Self-contained: does not import from standup/gather.mjs, which holds an
// equivalent-but-untyped reader today. Read failures degrade to null; this
// module never throws on a missing or malformed plan file.
//
// The tally is derived from parsed task ROWS only — never from an emoji count
// over the raw epic body — so a narrative mention of a status emoji cannot
// move the count (the front-door read fix this module exists for).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const Status = Object.freeze({
  DONE: 'done',
  IN_PROGRESS: 'in_progress',
  PLANNED: 'planned',
});

const DEFAULT_ROADMAP_PATH = 'docs/roadmap-execution-plan.md';

const STATUS_BY_EMOJI = [
  ['✅', Status.DONE],
  ['🟡', Status.IN_PROGRESS],
  ['⬜', Status.PLANNED],
];

const EPIC_HEADING_RE = /^Epic\s+(\d+)\s+—\s+(.+)$/;
const TASK_ROW_RE = /^- (✅|🟡|⬜) ([A-Za-z0-9][A-Za-z0-9-]*)\. (.+)$/;

export function roadmapPathFor(rootDir) {
  const raw = readFileSafe(join(rootDir, '.claude/project.json'));
  if (raw) {
    try {
      const cfg = JSON.parse(raw);
      const declared = cfg && cfg.roadmap && cfg.roadmap.path;
      if (typeof declared === 'string' && declared.trim()) return declared.trim();
    } catch {
      /* fall through to default */
    }
  }
  return DEFAULT_ROADMAP_PATH;
}

export function parseRoadmap(rootDir) {
  const path = roadmapPathFor(rootDir);
  const raw = readFileSafe(join(rootDir, path));
  if (raw === null) return null;

  const epics = [];
  let progress = [];
  for (const { heading, block } of splitSections(raw)) {
    const epicHeading = parseEpicHeading(heading);
    if (epicHeading) {
      const tasks = parseTaskRows(block, epicHeading.num);
      epics.push({ ...epicHeading, tasks, tally: tallyTasks(tasks) });
    } else if (/^Progress\b/.test(heading)) {
      progress = bulletLines(block);
    }
  }
  return { epics, progress, path };
}

// ---- Domain: epic heading -----------------------------------------------

function parseEpicHeading(heading) {
  const m = EPIC_HEADING_RE.exec(heading);
  if (!m) return null;
  const rest = m[2];
  const tag = field(rest, /\(([^)]*)\)/);
  const title = rest
    .replace(/\s*(?:✅|🟡|⬜).*$/u, '')
    .replace(/\s*\(.*$/, '')
    .trim();
  return { num: Number(m[1]), title, tag: tag ? tag.trim() : null, status: statusFromHeadingEmoji(rest) };
}

function statusFromHeadingEmoji(text) {
  let best = { status: 'unknown', at: Infinity };
  for (const [emoji, status] of STATUS_BY_EMOJI) {
    const at = text.indexOf(emoji);
    if (at !== -1 && at < best.at) best = { status, at };
  }
  return best.status;
}

// ---- Domain: task rows ----------------------------------------------------

function parseTaskRows(block, epicNum) {
  const lines = block.split('\n').slice(1); // drop the heading line (its emoji is the epic status)
  const tasks = [];
  let current = null;
  for (const line of lines) {
    const row = TASK_ROW_RE.exec(line);
    if (row) {
      current = {
        id: row[2],
        epicNum,
        status: statusFromMarker(row[1]),
        title: row[3].trim(),
        body: row[3].trim(),
      };
      tasks.push(current);
    } else if (line.trim() === '') {
      continue; // a blank line does not close a task's continuation
    } else if (current && isContinuationLine(line)) {
      current.body = `${current.body}\n${line.trim()}`;
    } else {
      current = null; // a non-indented, non-row line ends any open continuation
    }
  }
  return tasks;
}

function isContinuationLine(line) {
  return /^\s+\S/.test(line);
}

function statusFromMarker(emoji) {
  const found = STATUS_BY_EMOJI.find(([e]) => e === emoji);
  return found ? found[1] : 'unknown';
}

function tallyTasks(tasks) {
  return {
    done: tasks.filter((t) => t.status === Status.DONE).length,
    inProgress: tasks.filter((t) => t.status === Status.IN_PROGRESS).length,
    planned: tasks.filter((t) => t.status === Status.PLANNED).length,
  };
}

// ---- Foundation: file + text primitives ------------------------------

function readFileSafe(path) {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

function splitSections(raw) {
  return raw
    .split(/^##\s+/m)
    .slice(1)
    .map((block) => ({ heading: block.split('\n', 1)[0].trim(), block }));
}

function bulletLines(block) {
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).replace(/\*\*/g, '').trim());
}

function field(text, re) {
  const m = re.exec(text);
  return m ? m[1] : null;
}
