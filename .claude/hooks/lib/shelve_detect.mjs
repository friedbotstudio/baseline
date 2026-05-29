// Foundation — passive Stop-side switch detector (Decision D1).
//
// Compares the latest user turn's subject against the active thread's subject.
// On heuristic divergence it STAGES a switch-candidate to disk and returns a
// plain result object. It NEVER returns a control-flow {decision} object and
// the hook that folds it in emits nothing to stdout — harness_continuation
// owns the single Stop-event block decision (no collision).
//
// Heuristic only, no model: token-overlap between the prior subject and the
// latest user turn. Best-effort; never throws to the caller.

import { readEvents, eventText, stageCandidate } from './thread_store.mjs';

const OVERLAP_SWITCH_THRESHOLD = 0.2; // <= this fraction shared => topic switch

function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function overlapRatio(a, b) {
  const sa = tokens(a);
  const sb = tokens(b);
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared++;
  return shared / Math.min(sa.size, sb.size);
}

function latestUserTurn(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].role !== 'user') continue;
    const text = eventText(events[i].content);
    if (text) return { uuid: events[i].uuid, text };
  }
  return null;
}

export function detect({ transcriptPath, prevSubject, stateDir }) {
  try {
    const events = readEvents(transcriptPath);
    const turn = latestUserTurn(events);
    if (!turn || !prevSubject) return { staged: false, candidate: null };

    const ratio = overlapRatio(prevSubject, turn.text);
    if (ratio > OVERLAP_SWITCH_THRESHOLD) return { staged: false, candidate: null };

    const candidate = {
      detected: true,
      boundary_event_uuid: turn.uuid || null,
      prev_subject: String(prevSubject).slice(0, 200),
      curr_subject: turn.text.slice(0, 200),
      staged_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    };
    stageCandidate({ stateDir, candidate });
    return { staged: true, candidate };
  } catch {
    return { staged: false, candidate: null };
  }
}
