// Memory Stop transcript walker — invoked by memory_stop.mjs.
//
// Ported from the legacy memory_stop.py (byte-extracted from the .sh heredoc).
// Reads $TRANSCRIPT and appends candidate blocks to $PENDING. Best-effort —
// errors must never fail the hook.
//
// Exports `runMemoryStop({ transcript, pending, projectRoot })` which performs
// the full pass and writes to $PENDING in place. Returns nothing.

import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC_PREFIXES = ['src/', 'lib/', 'app/', 'pkg/', 'internal/', 'cmd/', '.claude/hooks/', '.claude/skills/'];
const SKIP_PREFIXES = [
  '.claude/memory/', '.claude/state/',
  'docs/scout/', 'docs/research/', 'docs/intake/',
  'docs/specs/', 'docs/brd/', 'docs/rca/',
  'docs/security/', 'docs/archive/',
];

function isSource(path) {
  if (typeof path !== 'string' || !path) return false;
  if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return false;
  return SRC_PREFIXES.some((p) => path.startsWith(p));
}

// Anchored line-start patterns. USER patterns accept an optional Markdown
// bullet prefix; ASSISTANT patterns require strict line-start. Mirrors the
// precision-favouring constraint in the original .py — mid-sentence matches
// MUST NOT fire.
const USER_BULLET = String.raw`^(?:\s*[-*]\s*)?`;
const ASSISTANT_BULLET = String.raw`^`;
const INTENT_TRIGGERS = [
  String.raw`TODO[:\s]`,
  String.raw`next\s+we\s+(?:should|need\s+to|must)\b`,
  String.raw`let'?s\s+also\b`,
  String.raw`we\s+should\s+also\b`,
  String.raw`backlog\s+this\b`,
  String.raw`after\s+this(?:\s+lands)?\b`,
];

const USER_INTENT_PATTERNS = INTENT_TRIGGERS.map((t) => new RegExp(USER_BULLET + t, 'i'));
const ASSISTANT_INTENT_PATTERNS = INTENT_TRIGGERS.map((t) => new RegExp(ASSISTANT_BULLET + t, 'i'));

// Stripped from the matched line before slug derivation so the slug captures
// the intent payload, not the trigger phrase.
const TRIGGER_STRIP = new RegExp(
  String.raw`^(?:\s*[-*]\s*)?` +
  String.raw`(?:TODO[:\s]+` +
  String.raw`|next\s+we\s+(?:should|need\s+to|must)\s+` +
  String.raw`|let'?s\s+also\s+` +
  String.raw`|we\s+should\s+also\s+` +
  String.raw`|backlog\s+this[:\s]*` +
  String.raw`|after\s+this(?:\s+lands)?[\s,]*)`,
  'i',
);

const NOISE_PREFIXES = ['<system-reminder>', '<command-name>', '<local-command-'];
const MAX_INTENT_TEXT_LEN = 240;

function extractTextBlocks(content) {
  const out = [];
  if (typeof content === 'string') {
    if (content.trim()) out.push(content.trim());
    return out;
  }
  if (!Array.isArray(content)) return out;
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type !== 'text') continue;
    const t = block.text;
    if (typeof t === 'string' && t.trim()) out.push(t.trim());
  }
  return out;
}

function filterNoise(text) {
  const head = text.replace(/^\s+/, '').slice(0, 64);
  return NOISE_PREFIXES.some((p) => head.startsWith(p));
}

function* iterIntentMatches(text, patterns) {
  for (const line of text.split(/\r?\n/)) {
    for (const pat of patterns) {
      if (pat.test(line)) {
        yield line;
        break;
      }
    }
  }
}

function normalizeIntent(line) {
  const stripped = line.replace(TRIGGER_STRIP, '').trim();
  if (!stripped) return '';
  return stripped.replace(/\s+/g, ' ').toLowerCase();
}

function slugWords(normalized, maxWords = 8) {
  const words = normalized.match(/[a-z0-9]+/g);
  if (!words) return '';
  return words.slice(0, maxWords).join('-');
}

function deriveKey(line) {
  const normalized = normalizeIntent(line);
  if (!normalized) return [null, ''];
  const slug = slugWords(normalized);
  if (!slug) return [null, ''];
  const hsh = createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 4);
  return [`${slug}-${hsh}`, normalized];
}

export function runMemoryStop({ transcript, pending, projectRoot }) {
  // Load existing pending body to avoid re-emitting duplicates within the session.
  let existing;
  try { existing = readFileSync(pending, 'utf8'); } catch { existing = ''; }
  const existingKeys = new Set();
  {
    const re = /^##\s+CANDIDATE:\s*(\S+)/gm;
    let m;
    while ((m = re.exec(existing)) !== null) existingKeys.add(m[1]);
  }

  const candidates = []; // [key, category, bodyLines]

  const pathTouches = new Map();
  const libQueries = []; // {library, topic}
  const intentCandidates = []; // {key, verbatim, role, source}
  const seenIntentKeys = new Set();

  let raw;
  try { raw = readFileSync(transcript, 'utf8'); }
  catch (e) {
    process.stderr.write(`memory_stop: transcript walk failed: ${e.message}\n`);
    raw = '';
  }

  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const msg = (ev && typeof ev === 'object' && ev.message) || ev;
    if (!msg || typeof msg !== 'object') continue;
    const content = msg.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type !== 'tool_use') continue;
      const name = block.name || '';
      const inp = (block.input && typeof block.input === 'object') ? block.input : {};
      if (name === 'Edit' || name === 'Write' || name === 'MultiEdit') {
        const fp = inp.file_path || '';
        if (fp) pathTouches.set(fp, (pathTouches.get(fp) || 0) + 1);
      } else if (name.includes('context7')) {
        const lib = inp.libraryName || inp.library_name || inp.libraryID;
        const topic = inp.topic || inp.query || '';
        if (lib) libQueries.push({ library: String(lib), topic: String(topic).slice(0, 80) });
      }
    }

    try {
      const role = msg.role || (ev && typeof ev === 'object' ? ev.role : null);
      if (role === 'user' || role === 'assistant') {
        const patterns = role === 'user' ? USER_INTENT_PATTERNS : ASSISTANT_INTENT_PATTERNS;
        const sourceValue = role === 'user' ? 'user-instruction' : 'assistant-deferral';
        for (const text of extractTextBlocks(content)) {
          if (filterNoise(text)) continue;
          for (const matchedLine of iterIntentMatches(text, patterns)) {
            const [key] = deriveKey(matchedLine);
            if (!key) continue;
            const dedupKey = `${key}::${sourceValue}`;
            if (seenIntentKeys.has(dedupKey)) continue;
            seenIntentKeys.add(dedupKey);
            let verbatim = matchedLine.trim();
            if (verbatim.length > MAX_INTENT_TEXT_LEN) {
              verbatim = verbatim.slice(0, MAX_INTENT_TEXT_LEN).replace(/\s+$/, '') + '…';
            }
            intentCandidates.push({ key, verbatim, role, source: sourceValue });
          }
        }
      }
    } catch (e) {
      process.stderr.write(`memory_stop: intent extraction failed for one event: ${e.message}\n`);
    }
  }

  // Build candidates.  Timestamp format matches the legacy `.py` —
  // strftime('%Y-%m-%dT%H:%MZ'), no seconds.
  const ts = new Date().toISOString().replace(/:\d{2}\.\d+Z$/, 'Z');

  // Landmark candidates from touched source files.
  const sortedTouches = [...pathTouches.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  for (const [fp, n] of sortedTouches) {
    const cwd = projectRoot || process.cwd();
    let rel = fp;
    if (fp.startsWith(cwd + '/')) rel = fp.slice(cwd.length + 1);
    if (!isSource(rel)) continue;
    const key = `${rel} → landmarks.md`;
    if (existingKeys.has(key)) continue;
    const body = [
      `## CANDIDATE: ${key}`,
      `- Touched in this session: ${n} time${n !== 1 ? 's' : ''}`,
      `- Suggested role: <fill in from session context>`,
      `- Source: file written/edited at ${ts}`,
      '',
    ];
    candidates.push([key, 'landmarks', body]);
  }

  // Library candidates from context7 queries.
  const seenLibs = new Set();
  for (const q of libQueries) {
    if (seenLibs.has(q.library)) continue;
    seenLibs.add(q.library);
    const key = `${q.library} → libraries.md`;
    if (existingKeys.has(key)) continue;
    const body = [
      `## CANDIDATE: ${key}`,
      `- Library: ${q.library}`,
      `- Topics queried this session: ${q.topic || '(no topic field)'}`,
      `- Source: context7 MCP query at ${ts}`,
      `- Reminder: pin a version before promoting to canonical (lib@version is the stable key).`,
      '',
    ];
    candidates.push([key, 'libraries', body]);
  }

  // Backlog (intent) candidates from user/assistant text blocks.
  let workflowSlug = '';
  try {
    const wfPath = join(projectRoot || process.cwd(), '.claude/state/workflow.json');
    if (existsSync(wfPath)) {
      const wf = JSON.parse(readFileSync(wfPath, 'utf8'));
      workflowSlug = wf.slug || '';
    }
  } catch {}

  for (const cand of intentCandidates) {
    const fullKey = `backlog → ${cand.key}`;
    if (existingKeys.has(fullKey)) continue;
    const body = [
      `## CANDIDATE: backlog → ${cand.key}`,
      `- Intent: ${cand.verbatim}`,
      `- Role: ${cand.role}`,
      `- Source: ${cand.source}`,
      `- Context: ${workflowSlug || '(no active workflow)'}`,
      `- Emitted-at: ${ts}`,
      '',
    ];
    candidates.push([fullKey, 'backlog', body]);
  }

  if (candidates.length === 0) return;

  // Append a session-tagged block to pending.
  const prefix = `\n\n<!-- session ${ts} -->\n`;
  const newBlock = prefix + candidates.map(([, , b]) => b.join('\n')).join('\n');
  try { appendFileSync(pending, newBlock); } catch {}

  // Count pre-existing candidates in `existing`, then add the new ones.
  let priorCount = 0;
  {
    const re = /^##\s+CANDIDATE\b/gm;
    while (re.exec(existing) !== null) priorCount++;
  }
  const total = priorCount + candidates.length;
  process.stderr.write(
    `memory_stop: appended ${candidates.length} candidate(s) to .claude/memory/_pending.md ` +
    `(total pending: ${total}). Run /memory-flush to review.\n`
  );
}
