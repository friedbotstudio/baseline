// Foundation — mechanical shelve capture (Decisions D2 + D3).
//
// On shelve: extract conversation verbatim + raw signals over the cursor span
// [cursor.last_event_uuid .. end] and append a ThreadEntry. NO model, NO
// summary (the summary is produced at resume per D2 — "extract verbatim during
// shelve, transform during resume"). Cursor advances to the span end after
// append. Cross-session: if the cursor's transcript differs from the current
// one, fall back to the whole current transcript (span_start_uuid = null).

import {
  readEvents, eventText, appendEntry, readCursor, writeCursor,
} from './thread_store.mjs';

// Volume caps (parallel to resume_writer's MAX_* — a long thread is bounded
// at capture so the trail and SessionStart injection stay readable).
const MAX_CUES = 8;
const MAX_FILES = 24;
const MAX_OPEN_QUESTIONS = 6;
const CUE_CHARS = 800;

function spanEvents(events, startUuid, end) {
  let lo = 0;
  if (startUuid) {
    const i = events.findIndex((e) => e.uuid === startUuid);
    lo = i >= 0 ? i + 1 : 0; // exclusive of the cursor event
  }
  let hi = events.length - 1;
  if (end && end.type === 'uuid' && end.uuid) {
    const j = events.findIndex((e) => e.uuid === end.uuid);
    if (j >= 0) hi = j; // inclusive of the switch-point
  }
  return events.slice(lo, hi + 1);
}

function extract(events) {
  const cues = [];
  const files = [];
  const openQuestions = [];
  let nextStep = '';
  for (const ev of events) {
    if (ev.role === 'user') {
      const text = eventText(ev.content);
      if (text) {
        cues.push(text.length > CUE_CHARS ? text.slice(0, CUE_CHARS) + '…' : text);
        for (const sentence of text.split(/(?<=[.?!])\s+/)) {
          if (/\?\s*$/.test(sentence) && openQuestions.length < MAX_OPEN_QUESTIONS) {
            openQuestions.push(sentence.trim());
          }
        }
      }
    } else if (ev.role === 'assistant' && Array.isArray(ev.content)) {
      for (const b of ev.content) {
        if (!b || typeof b !== 'object') continue;
        if (b.type === 'tool_use' && (b.name === 'Write' || b.name === 'Edit' || b.name === 'MultiEdit')) {
          const fp = b.input && b.input.file_path;
          if (fp && !files.includes(fp)) files.push(fp);
        }
      }
      const t = eventText(ev.content);
      if (t) nextStep = t.split(/\r?\n/)[0].slice(0, 200);
    }
  }
  return {
    verbatim_cues: cues.slice(-MAX_CUES),
    open_question_candidates: openQuestions.slice(0, MAX_OPEN_QUESTIONS),
    in_flight_files: files.slice(0, MAX_FILES),
    next_step: nextStep || '(continue the shelved thread)',
  };
}

export async function capture({ transcriptPath, memDir, stateDir, end }) {
  const events = readEvents(transcriptPath);
  const cursor = readCursor({ stateDir });

  const crossSession = cursor && cursor.transcript_path && cursor.transcript_path !== transcriptPath;
  const startUuid = crossSession || !cursor ? null : (cursor.last_event_uuid || null);

  const inSpan = spanEvents(events, startUuid, end);
  const signals = extract(inSpan);

  const lastUuid = inSpan.length ? inSpan[inSpan.length - 1].uuid : null;
  const endUuid = end && end.type === 'uuid' && end.uuid ? end.uuid : lastUuid;

  const entry = {
    shelved_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    trigger: end && end.type === 'uuid' ? 'auto' : 'model',
    span_start_uuid: startUuid,
    span_end_uuid: endUuid,
    ...signals,
  };

  appendEntry({ memDir, entry });
  writeCursor({ stateDir, cursor: { transcript_path: transcriptPath, last_event_uuid: endUuid, timestamp: entry.shelved_at } });
  return entry;
}
