// roadmap-sync — flip roadmap status markers deterministically, fail-open.
// Foundation: pure text->text transforms (flipTask, promoteEpicHeading, auditRoadmap,
// resolveRoadmapPath). Orchestration: syncRoadmap does the single file read/write,
// and recomputes every epic heading before writing — not only the ones it flipped.
// The format contract mirrors standup/gather.mjs: task lines carry exactly one of
// ⬜/🟡/✅; epic headings are `## Epic N — Title  <emoji>  (tag)` (em-dash, one emoji).

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import {
  matchEpicHeadingLine,
  statusEmojiScanner,
  PLANNED,
  IN_PROGRESS,
  DONE,
  STATUS_EMOJI_SOURCE,
} from '../lib/epic-heading.mjs';

const TASK_LINE = new RegExp(`^\\s*-\\s+(${STATUS_EMOJI_SOURCE})\\s+(\\S+?)\\.\\s`, 'u');

// --- Foundation: single task line ⬜/🟡 -> ✅ -------------------------------

export function flipTask(text, taskId) {
  const lines = text.split('\n');
  let changed = false;
  const out = lines.map((line) => {
    const m = TASK_LINE.exec(line);
    if (!m || m[2] !== taskId) return line;
    if (m[1] === DONE) return line;
    changed = true;
    return line.replace(m[1], DONE);
  });
  return { text: out.join('\n'), changed };
}

// --- Foundation: locate an epic's task body [start heading, end) ------------

function epicBodyRange(lines, epicNum) {
  const start = lines.findIndex((l) => matchEpicHeadingLine(l)?.num === Number(epicNum));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  return { start, end };
}

// Epic-scoped flip: task labels (P1/W1/…) repeat across epics, so a token's
// epic number disambiguates which one to flip. Reuses flipTask on the body slice.
export function flipTaskInEpic(text, epicNum, taskId) {
  const lines = text.split('\n');
  const range = epicBodyRange(lines, epicNum);
  if (!range) return { text, changed: false };
  const body = lines.slice(range.start + 1, range.end).join('\n');
  const { text: newBody, changed } = flipTask(body, taskId);
  if (!changed) return { text, changed: false };
  const merged = [...lines.slice(0, range.start + 1), ...newBody.split('\n'), ...lines.slice(range.end)];
  return { text: merged.join('\n'), changed: true };
}

// True iff `E<num>-<taskId>` names a task line that exists in that epic's body
// (regardless of current status), so a producer can validate a token before writing it.
export function taskTokenResolves(text, token) {
  const parsed = parseTaskToken(token);
  if (!parsed) return false;
  const lines = text.split('\n');
  const range = epicBodyRange(lines, parsed.epicNum);
  if (!range) return false;
  for (let i = range.start + 1; i < range.end; i += 1) {
    const m = TASK_LINE.exec(lines[i]);
    if (m && m[2] === parsed.taskId) return true;
  }
  return false;
}

// --- Foundation: recompute an epic heading emoji from its task body ---------

const HEADING_EMOJI_FOR = { done: DONE, 'in-progress': IN_PROGRESS, planned: PLANNED };

export function promoteEpicHeading(text, epicNum) {
  const lines = text.split('\n');
  const headingIdx = lines.findIndex((l) => matchEpicHeadingLine(l)?.num === Number(epicNum));
  if (headingIdx === -1) return { text, changed: false, status: 'unknown' };

  const status = impliedStatus(epicBodyTally(lines, headingIdx)) ?? 'planned';
  if (status === 'planned') return { text, changed: false, status };

  const wanted = HEADING_EMOJI_FOR[status];
  const heading = lines[headingIdx];
  if (heading.includes(wanted) && (heading.match(statusEmojiScanner()) || []).length === 1) {
    return { text, changed: false, status };
  }
  lines[headingIdx] = heading.replace(statusEmojiScanner(), wanted);
  return { text: lines.join('\n'), changed: true, status };
}

// --- Foundation: within-repo path resolution (fail-open on escape) ----------

export function resolveRoadmapPath(cfg, repoRoot) {
  if (!cfg || typeof cfg !== 'string') return null;
  if (resolve(cfg) === cfg) return null; // absolute path — reject
  const abs = resolve(repoRoot, cfg);
  const root = repoRoot.endsWith(sep) ? repoRoot : repoRoot + sep;
  if (abs !== repoRoot && !abs.startsWith(root)) return null; // escapes repo
  return abs;
}

// --- Foundation: consistency audit (reports, never mutates) -----------------
// Heading consistency uses a whole-body emoji tally (the same view standup takes),
// so it is robust to this roadmap's compact multi-task lines (`- ⬜ W1. … ⬜ W2. …`).
// The only malformed-line signal is ADJACENT status emojis (`⬜ ✅ D1.`) — two emojis
// separated by whitespace with no task label between, which a legitimate multi-task
// line never has.

const ADJACENT_EMOJI = new RegExp(
  `(?:${STATUS_EMOJI_SOURCE})\\s+(?:${STATUS_EMOJI_SOURCE})`,
  'u',
);

function epicBodyTally(lines, headingIdx) {
  const tally = { done: 0, inProgress: 0, planned: 0 };
  for (let i = headingIdx + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) break;
    for (const e of lines[i].match(statusEmojiScanner()) || []) {
      if (e === DONE) tally.done += 1;
      else if (e === IN_PROGRESS) tally.inProgress += 1;
      else tally.planned += 1;
    }
  }
  return tally;
}

function impliedStatus({ done, inProgress, planned }) {
  if (done + inProgress + planned === 0) return null;
  if (inProgress === 0 && planned === 0) return 'done';
  if (done > 0) return 'in-progress';
  return 'planned';
}

export function auditRoadmap(text) {
  const lines = text.split('\n');
  const anomalies = [];
  lines.forEach((line, idx) => {
    const epic = matchEpicHeadingLine(line);
    if (epic) {
      const implied = impliedStatus(epicBodyTally(lines, idx));
      if (implied) {
        const headingEmoji = (line.match(statusEmojiScanner()) || [])[0];
        if (headingEmoji !== HEADING_EMOJI_FOR[implied]) {
          anomalies.push(`Epic ${epic.num} heading is ${headingEmoji ?? 'none'} but body implies ${implied}`);
        }
      }
      return;
    }
    if (/^\s*-\s/.test(line) && ADJACENT_EMOJI.test(line)) {
      anomalies.push(`Adjacent status emojis (malformed): ${line.trim()}`);
    }
  });
  return { anomalies };
}

// --- Foundation: every epic number the roadmap declares, in file order ------

function epicNumbers(text) {
  const nums = [];
  for (const line of text.split('\n')) {
    const epic = matchEpicHeadingLine(line);
    if (epic) nums.push(epic.num);
  }
  return nums;
}

// --- Foundation: parse a `E<num>-<taskId>` token ----------------------------

function parseTaskToken(token) {
  const dash = token.indexOf('-');
  if (dash === -1) return null;
  const epicMatch = /^E(\d+)$/.exec(token.slice(0, dash));
  if (!epicMatch) return null;
  const taskId = token.slice(dash + 1);
  if (!taskId) return null;
  return { epicNum: Number(epicMatch[1]), taskId };
}

// --- Orchestration: read -> flip+promote -> write (fail-open) ---------------

export function syncRoadmap({ roadmapPath, roadmapTasks } = {}) {
  const tasks = Array.isArray(roadmapTasks) ? roadmapTasks : [];
  const noopResult = { flipped: [], promoted: [], healed: [], skipped: tasks, noop: true, anomalies: [] };
  if (!roadmapPath) return noopResult;

  try {
    let text = readFileSync(roadmapPath, 'utf8');
    const flipped = [];
    const skipped = [];
    const affectedEpics = new Set();

    for (const token of tasks) {
      const parsed = parseTaskToken(token);
      if (!parsed) { skipped.push(token); continue; }
      const { text: next, changed } = flipTaskInEpic(text, parsed.epicNum, parsed.taskId);
      if (changed) { text = next; flipped.push(token); affectedEpics.add(parsed.epicNum); }
      else skipped.push(token);
    }

    const promoted = [];
    for (const epicNum of affectedEpics) {
      const { text: next, changed } = promoteEpicHeading(text, epicNum);
      if (changed) { text = next; promoted.push(`Epic ${epicNum}`); }
    }

    // A heading is derived data, so every one gets recomputed — not only the epics
    // this run flipped. A slice marked done by hand leaves its heading stale, and
    // nothing else on the per-commit path repairs it.
    const healed = [];
    for (const epicNum of epicNumbers(text)) {
      if (affectedEpics.has(epicNum)) continue; // already resolved above; keeps the two arrays disjoint
      const { text: next, changed } = promoteEpicHeading(text, epicNum);
      if (changed) { text = next; healed.push(`Epic ${epicNum}`); }
    }

    const noop = flipped.length === 0 && promoted.length === 0 && healed.length === 0;
    if (!noop) writeFileSync(roadmapPath, text, 'utf8');
    return { flipped, promoted, healed, skipped, noop, anomalies: auditRoadmap(text).anomalies };
  } catch {
    return noopResult;
  }
}
