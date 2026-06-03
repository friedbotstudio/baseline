// Foundation — durable local conversation-trail store (conversation-thread-shelving).
//
// Owns all I/O for the LOCAL, gitignored single rolling trail and its sidecar
// state: the `_thread.md` trail file, the thread cursor, and the staged
// switch-candidate. Pure filesystem + JSON; no model, no network. Best-effort
// readers return null on absence/parse failure so callers (hooks) never throw.
//
// The trail survives `/memory-flush` by construction: `_thread.md` is NOT a
// member of sweep.mjs CANONICAL_FILES and is not the _pending reset target.

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic } from './common.mjs';

export const THREAD_FILENAME = '_thread.md';
const CURSOR_FILENAME = 'thread_cursor.json';
const CANDIDATE_FILENAME = 'shelve_candidate.json';

const TRAIL_HEADER = '# Conversation thread trail (local, gitignored)\n\n' +
  'Durable per-developer continuity narrative. Mechanically appended at shelve, ' +
  'transformed at resume. Survives /memory-flush. Never committed.\n';

// Each shelved section embeds its entry object as JSON inside an HTML comment
// so verbatim cues round-trip byte-identical (AC-7), with readable markdown
// beneath for humans and SessionStart injection.
const DATA_OPEN = '<!-- thread-entry';
const DATA_CLOSE = '-->';

// ---- low-level transcript reader (shared by shelve_detect + shelve_capture) ----

export function readEvents(transcriptPath) {
  let raw;
  try { raw = readFileSync(transcriptPath, 'utf8'); }
  catch { return []; }
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let ev;
    try { ev = JSON.parse(t); } catch { continue; }
    const msg = (ev && typeof ev === 'object' && ev.message && typeof ev.message === 'object') ? ev.message : ev;
    const uuid = (ev && ev.uuid) || null;
    out.push({ uuid, role: msg && msg.role, content: msg && msg.content });
  }
  return out;
}

export function eventText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const b of content) {
    if (b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string') parts.push(b.text.trim());
  }
  return parts.join('\n').trim();
}

// ---- section render / parse ----

function renderSection(entry) {
  // The entry JSON is base64-encoded inside the HTML comment so no payload byte
  // can collide with the `-->` close delimiter (CWE-116): base64's alphabet is
  // [A-Za-z0-9+/=], which contains no `-`. This guarantees verbatim cues round
  // -trip byte-identical even when a cue itself contains `-->` (AC-007).
  const data = `${DATA_OPEN}\n${Buffer.from(JSON.stringify(entry), 'utf8').toString('base64')}\n${DATA_CLOSE}`;
  const cues = entry.verbatim_cues.length
    ? entry.verbatim_cues.map((c) => `> ${c}`).join('\n')
    : '> (none captured)';
  const oq = entry.open_question_candidates.length
    ? entry.open_question_candidates.map((q) => `- ${q}`).join('\n')
    : '- (none)';
  const files = entry.in_flight_files.length
    ? entry.in_flight_files.map((f) => `- \`${f}\``).join('\n')
    : '- (none)';
  return [
    `## SHELVED ${entry.shelved_at} · trigger:${entry.trigger} · span:${entry.span_start_uuid || 'start'}..${entry.span_end_uuid || 'now'}`,
    '',
    data,
    '',
    '### Verbatim cues',
    cues,
    '',
    '### Open questions',
    oq,
    '',
    '### In-flight files',
    files,
    '',
    '### Next step',
    entry.next_step || '(none)',
    '',
  ].join('\n');
}

function parseSections(text) {
  const out = [];
  let idx = 0;
  while (true) {
    const open = text.indexOf(DATA_OPEN, idx);
    if (open < 0) break;
    const close = text.indexOf(DATA_CLOSE, open + DATA_OPEN.length);
    if (close < 0) break;
    const b64 = text.slice(open + DATA_OPEN.length, close).trim();
    try { out.push(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))); } catch {}
    idx = close + DATA_CLOSE.length;
  }
  return out;
}

// ---- trail file ----

// Count cap on the rolling trail. One section is appended per shelve and the
// trail is OUTSIDE /memory-flush's reset path by design, so without a cap it
// grows unbounded. Only the most-recent section is ever injected at
// SessionStart, so retaining the newest N bounds disk growth with no loss of
// live continuity.
export const THREAD_MAX_SECTIONS = 20;

export function appendEntry({ memDir, entry, maxSections = THREAD_MAX_SECTIONS }) {
  const path = join(memDir, THREAD_FILENAME);
  try { mkdirSync(memDir, { recursive: true }); } catch {}
  if (!existsSync(path)) writeFileSync(path, TRAIL_HEADER);
  appendFileSync(path, '\n' + renderSection(entry));
  pruneTrail({ memDir, maxSections });
  return entry;
}

// Evict oldest sections so at most `maxSections` remain. Sections are identified
// by their base64 data block (parseSections), NOT by the `## SHELVED` heading
// line: a multi-line verbatim cue can render a bare line beginning `## SHELVED `,
// and counting those would miscount boundaries and wrongly evict a surviving
// section. Survivors are re-rendered from the parsed entries — deterministic and
// byte-identical to the originals because the entry round-trips through base64.
// Atomic rewrite (temp + rename) so a crash can't truncate the trail mid-write.
// Best-effort: any read/write failure leaves the trail untouched, reports none.
export function pruneTrail({ memDir, maxSections = THREAD_MAX_SECTIONS }) {
  const path = join(memDir, THREAD_FILENAME);
  if (!existsSync(path)) return { kept: 0, evicted: 0 };
  let entries;
  try { entries = parseSections(readFileSync(path, 'utf8')); }
  catch { return { kept: 0, evicted: 0 }; }
  // Pin: the most-recent working-thread entry is retained regardless of the cap,
  // and older working entries collapse to that single pin. Ordinary sections keep
  // the last `maxSections`. Chronological order is preserved in the rewrite.
  let pinnedIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i] && entries[i].working_thread === true) { pinnedIdx = i; break; }
  }
  const ordinaryIdx = entries
    .map((_, i) => i)
    .filter((i) => !(entries[i] && entries[i].working_thread === true));
  const keepIdx = new Set(ordinaryIdx.slice(Math.max(0, ordinaryIdx.length - maxSections)));
  if (pinnedIdx >= 0) keepIdx.add(pinnedIdx);
  if (keepIdx.size >= entries.length) return { kept: entries.length, evicted: 0 };
  const keep = entries.filter((_, i) => keepIdx.has(i));
  const rebuilt = TRAIL_HEADER + keep.map((e) => '\n' + renderSection(e)).join('');
  try {
    const tmp = path + '.tmp';
    writeFileSync(tmp, rebuilt);
    renameSync(tmp, path);
  } catch {
    return { kept: entries.length, evicted: 0 };
  }
  return { kept: keep.length, evicted: entries.length - keep.length };
}

export function listSections({ memDir }) {
  const path = join(memDir, THREAD_FILENAME);
  if (!existsSync(path)) return [];
  try { return parseSections(readFileSync(path, 'utf8')); }
  catch { return []; }
}

// The durable working thread: the most-recent section flagged working_thread.
// Pinned by pruneTrail, so it survives /clear and the 20-section cap (Tier 3).
export function readWorkingThread({ memDir }) {
  const all = listSections({ memDir });
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i] && all[i].working_thread === true) return all[i];
  }
  return null;
}

export function readMostRecent({ memDir }) {
  const all = listSections({ memDir });
  return all.length ? all[all.length - 1] : null;
}

// Return the raw markdown of the most-recent section (for SessionStart
// injection) — only the newest, so older sections are never injected.
export function readMostRecentMarkdown({ memDir }) {
  const path = join(memDir, THREAD_FILENAME);
  if (!existsSync(path)) return '';
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { return ''; }
  const heads = [...text.matchAll(/^## SHELVED .*$/gm)];
  if (!heads.length) return '';
  const last = heads[heads.length - 1];
  return text.slice(last.index).trim();
}

// ---- cursor + candidate (JSON sidecars under stateDir) ----

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}
function writeJson(path, obj) {
  try { mkdirSync(join(path, '..'), { recursive: true }); } catch {}
  // Atomic temp+rename (CWE-362) — a crash mid-write can't corrupt the cursor /
  // candidate sidecar that the next session reads.
  writeJsonAtomic(path, obj);
}

export function readCursor({ stateDir }) { return readJson(join(stateDir, CURSOR_FILENAME)); }
export function writeCursor({ stateDir, cursor }) { writeJson(join(stateDir, CURSOR_FILENAME), cursor); }
export function readCandidate({ stateDir }) { return readJson(join(stateDir, CANDIDATE_FILENAME)); }
export function stageCandidate({ stateDir, candidate }) { writeJson(join(stateDir, CANDIDATE_FILENAME), candidate); }
