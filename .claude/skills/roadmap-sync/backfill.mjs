// roadmap-backfill — Orchestration: epic state on disk -> epic sections on the plan.
// Fail-open like sync.mjs: every failure returns a named no-op and never throws,
// because this runs inside a commit path that the plan must never block.

import { readFileSync, writeFileSync } from 'node:fs';

import { promoteEpicHeading } from './sync.mjs';
import { appendEpic } from './append.mjs';
import { readRoadmapPath, readEpicStates, stampEpicNumber } from './epic-store.mjs';

const PLANNED = '⬜';
const IN_PROGRESS = '🟡';
const DONE = '✅';

// --- Domain: what the plan should say about one epic -------------------------

function titleFor(state, slug) {
  if (typeof state.title === 'string' && state.title.trim()) return state.title.trim();
  return slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function sliceStatus(children, id) {
  const child = (Array.isArray(children) ? children : []).find((c) => c?.slice === id);
  if (!child) return PLANNED;
  return child.status === 'committed' ? DONE : IN_PROGRESS;
}

function epicSpecFor({ slug, state }) {
  return {
    slug,
    title: titleFor(state, slug),
    slices: (Array.isArray(state.slices) ? state.slices : []).map((slice) => ({
      id: slice.id,
      title: slice.title,
      status: sliceStatus(state.children, slice.id),
    })),
  };
}

function noop(reason, skipped = []) {
  return { appended: [], skipped, noop: true, ...(reason ? { reason } : {}), anomalies: [] };
}

// --- Domain: fold every epic into one accumulated text -----------------------

function foldEpics(text, entries) {
  const appended = [];
  const skipped = [];
  const stamps = [];

  for (const entry of entries) {
    if (!entry.state) { skipped.push({ slug: entry.slug, reason: 'unreadable epic state' }); continue; }
    try {
      const result = appendEpic(text, epicSpecFor(entry));
      if (!result.changed) { skipped.push({ slug: entry.slug, reason: 'already on the roadmap' }); continue; }
      text = promoteEpicHeading(result.text, result.epicNum).text;
      appended.push({ slug: entry.slug, epicNum: result.epicNum });
      stamps.push({ slug: entry.slug, path: entry.path, state: entry.state, num: result.epicNum });
    } catch (err) {
      skipped.push({ slug: entry.slug, reason: `invalid epic state: ${err.message}` });
    }
  }
  return { text, appended, skipped, stamps };
}

// --- Orchestration -----------------------------------------------------------

export function backfillEpics({ rootDir, slugs, dryRun = false } = {}) {
  const roadmapPath = readRoadmapPath(rootDir);
  if (!roadmapPath) return noop('no-roadmap');

  let original;
  try {
    original = readFileSync(roadmapPath, 'utf8');
  } catch {
    return noop('no-roadmap');
  }

  const { text, appended, skipped, stamps } = foldEpics(original, readEpicStates(rootDir, slugs));
  if (appended.length === 0) return noop(null, skipped);
  if (dryRun) return { appended, skipped, noop: false, dryRun: true, anomalies: [] };

  try {
    writeFileSync(roadmapPath, text, 'utf8');
  } catch {
    return noop('roadmap-unwritable', skipped);
  }

  // Security review 2026-08-15 (MEDIUM, CWE-460): the roadmap write already
  // landed, so a throw here would leave the plan carrying an epic whose state
  // never learned its number — every child of it would then seed an empty
  // roadmap_tasks and could never turn its row green. Degrade and name it.
  for (const stamp of stamps) {
    try {
      stampEpicNumber(stamp.path, stamp.state, stamp.num);
    } catch (err) {
      skipped.push({ slug: stamp.slug, reason: `appended, but the roadmap_epic stamp failed: ${err.message}` });
    }
  }

  return { appended, skipped, noop: false, anomalies: [] };
}
