#!/usr/bin/env node
// Covers AC-002, AC-010, AC-011 of remove-python-runtime-dep.
// Deterministic actuator for /memory-flush Step 0 and for /commit Step 6.
//
// Scans canonical memory files for closure fields and prose closure signals,
// applies the matching action (auto-close / surface-and-confirm / stale-sweep),
// and emits a JSON action report. Also exposes a non-interactive stamp-closure
// mode invoked by /commit (Phase 11, Step 6) to write status: picked-up +
// superseded-at: today on backlog entries named in workflow.json →
// source_backlog_keys.
//
// CLI:
//   --mode {auto-close, prose-scan, stale-sweep, stamp-closure}
//   --memory-dir <path>
//   --backlog-keys <csv>   (required iff --mode stamp-closure)
//
// For interactive modes (prose-scan, stale-sweep), one reply per surfaced
// entry is read from stdin. Empty stdin / EOF defaults to "keep". stamp-closure
// is non-interactive; --backlog-keys is the input channel.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const CANONICAL_FILES = [
  'landmarks', 'libraries', 'decisions',
  'landmines', 'conventions', 'pending-questions',
  'backlog',
];
const PENDING_FILE = 'pending-questions';
const STALE_EXEMPT_FILES = new Set(['backlog']);
const STALE_COMMITS = 30;
const STALE_DAYS = 30;
const BACKLOG_DECAY_DAYS_DEFAULT = 90;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PROSE_PATTERNS = [
  /^(\s*-\s*)?\*\*?Resolution\s+(path\s+taken|by|date)\b/im,
  /^Superseded\s+(by|at|on)\b/im,
  /^Resolved\s+(by|on|at)\b/im,
  // R4: `- Resolution: ...` bullet form — the shape actually used by
  // pending-questions Q-NNN entries closed via "## Q-NNN — CLOSED <date>"
  // heading + body resolution text. Documented R1 expects "Resolution
  // path taken|by|date" only, which never matched the live entries.
  // Allows 0-2 leading asterisks so both `- Resolution:` and `**Resolution:**`
  // styles surface.
  /^(\s*-\s*)?\*{0,2}Resolution\s*:/im,
];

// Heading-suffix closure: "## <key> — CLOSED YYYY-MM-DD". Detected as a
// structured-equivalent closure signal so modeAutoClose can delete the
// entry without requiring a body `resolved-at:` / `superseded-at:` field.
// Tolerates em-dash (U+2014) OR ASCII double-hyphen.
const HEADING_CLOSURE_RE = /^##\s+\S.*?\s+(?:—|--)\s+CLOSED\s+(\d{4}-\d{2}-\d{2})\s*$/m;

function readHeadingClosureDate(block) {
  const m = block.match(HEADING_CLOSURE_RE);
  return m ? m[1] : null;
}

// --- Foundation: filesystem + entry parsing ---------------------------------

function filePath(memdir, name) {
  return join(memdir, `${name}.md`);
}

function readFile(memdir, name) {
  const p = filePath(memdir, name);
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf8');
}

function writeFile(memdir, name, text) {
  writeFileSync(filePath(memdir, name), text, 'utf8');
}

function splitEntries(text) {
  // #13: strip frontmatter via line-anchored `^---$` lookup so a body
  // horizontal rule before the actual close doesn't silently truncate
  // content. Mirrors the safer stripFrontmatter in memory_session_start.
  let body = text;
  if (text.startsWith('---')) {
    const lines = text.split(/\r?\n/);
    if (lines[0].trim() === '---') {
      let closeIdx = -1;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') { closeIdx = i; break; }
      }
      if (closeIdx >= 0) body = lines.slice(closeIdx + 1).join('\n');
    }
  }
  const splits = body.split(/(^##\s+\S.*)$/m);
  const entries = [];
  for (let i = 1; i < splits.length; i += 2) {
    const heading = splits[i];
    const tail = i + 1 < splits.length ? splits[i + 1] : '';
    const trimmed = heading.slice(2).trim();
    const key = trimmed ? trimmed.split(/\s+/)[0] : '';
    entries.push([key, heading + tail]);
  }
  return entries;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readFieldValue(block, name) {
  const pat = new RegExp(`^\\s*-\\s*${escapeRegex(name)}\\s*:\\s*(.+?)\\s*$`, 'im');
  const m = block.match(pat);
  return m ? m[1] : null;
}

function hasField(block, name) {
  return readFieldValue(block, name) !== null;
}

function validIso(s) {
  if (!s || !ISO_DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function deleteBlock(text, block) {
  const idx = text.indexOf(block);
  if (idx < 0) return text;
  const before = text.slice(0, idx).replace(/\n+$/, '');
  const after = text.slice(idx + block.length).replace(/^\n+/, '');
  if (before && after) return before + '\n\n' + after;
  if (before) return before + '\n';
  return after;
}

function updateField(block, name, value) {
  const pat = new RegExp(`(^\\s*-\\s*${escapeRegex(name)}\\s*:\\s*).+$`, 'im');
  if (pat.test(block)) {
    return block.replace(pat, (_full, prefix) => `${prefix}${value}`);
  }
  return appendField(block, name, value);
}

function appendField(block, name, value) {
  const lines = block.replace(/\n+$/, '').split('\n');
  let insertAt = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().startsWith('-')) { insertAt = i + 1; break; }
  }
  lines.splice(insertAt, 0, `- ${name}: ${value}`);
  return lines.join('\n') + '\n';
}

// --- Foundation: git + dates ------------------------------------------------

function headSha(root) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function commitDistance(root, stamp) {
  const r = spawnSync('git', ['-C', root, 'rev-list', '--count', `${stamp}..HEAD`], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const out = r.stdout.trim();
  return /^\d+$/.test(out) ? parseInt(out, 10) : null;
}

function daysSince(iso) {
  if (!validIso(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`).getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.floor((today - d) / 86400000);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// --- Domain: closure semantics ----------------------------------------------

function closureFieldFor(name) {
  return name === PENDING_FILE ? 'resolved-at' : 'superseded-at';
}

function invariantFieldFor(name) {
  return name === PENDING_FILE ? 'superseded-at' : 'resolved-at';
}

function isClosed(block, name) {
  return hasField(block, closureFieldFor(name));
}

function proseMatches(block) {
  return PROSE_PATTERNS.some(p => p.test(block));
}

function isStale(block, name, head, root) {
  if (STALE_EXEMPT_FILES.has(name)) return false;
  if (isClosed(block, name)) return false;
  const stamp = readFieldValue(block, 'verified-at');
  if (head && stamp && stamp !== 'HEAD') {
    const dist = commitDistance(root, stamp);
    return dist === null || dist >= STALE_COMMITS;
  }
  // Fallback: date-based decay on `last-touched`. Used for non-git projects
  // AND for git projects where `verified-at: HEAD` means the writer didn't
  // have an actual SHA at stamp time. Closes the prior decay-evasion hatch
  // where `verified-at: HEAD` on a git repo was treated as permanently fresh.
  const touched = readFieldValue(block, 'last-touched');
  const days = touched ? daysSince(touched) : null;
  return days !== null && days >= STALE_DAYS;
}

// --- Domain: per-mode sweepers ----------------------------------------------

function modeAutoClose(memdir) {
  const report = { closed: 0, malformed: [], invariant_violation: [] };
  for (const name of CANONICAL_FILES) {
    const text = readFile(memdir, name);
    if (!text) continue;
    const valid = closureFieldFor(name);
    const wrong = invariantFieldFor(name);
    let newText = text;
    for (const [key, block] of splitEntries(text)) {
      if (hasField(block, wrong)) {
        report.invariant_violation.push({ file: `${name}.md`, key, field: wrong });
        continue;
      }
      // Structured field first; heading-suffix `— CLOSED <date>` second.
      // Both produce the same closure semantics; heading-suffix exists so
      // legacy entries that pre-date the structured-field convention still
      // close automatically.
      let value = readFieldValue(block, valid);
      if (value === null) value = readHeadingClosureDate(block);
      if (value === null) continue;
      if (validIso(value)) {
        newText = deleteBlock(newText, block);
        report.closed += 1;
      } else {
        report.malformed.push({ file: `${name}.md`, key, value });
      }
    }
    if (newText !== text) writeFile(memdir, name, newText);
  }
  return report;
}

const stdinReplies = (() => {
  let lines = null;
  let idx = 0;
  return () => {
    if (lines === null) {
      try {
        const raw = readFileSync(0, 'utf8');
        lines = raw.split('\n');
      } catch {
        lines = [];
      }
    }
    if (idx >= lines.length) return '';
    return lines[idx++].trim().toLowerCase();
  };
})();

function modeProseScan(memdir) {
  const report = { surfaced: 0, closed_by_confirm: 0, kept: 0, deferred: 0 };
  for (const name of CANONICAL_FILES) {
    const text = readFile(memdir, name);
    if (!text) continue;
    let newText = text;
    for (const [, block] of splitEntries(text)) {
      if (isClosed(block, name)) continue;
      if (!proseMatches(block)) continue;
      report.surfaced += 1;
      const reply = stdinReplies();
      if (reply === 'y') {
        newText = deleteBlock(newText, block);
        report.closed_by_confirm += 1;
      } else if (reply === 'skip') {
        report.deferred += 1;
      } else {
        report.kept += 1;
      }
    }
    if (newText !== text) writeFile(memdir, name, newText);
  }
  return report;
}

function findEntryBlock(text, key) {
  for (const [entryKey, block] of splitEntries(text)) {
    if (entryKey === key) return block;
  }
  return null;
}

function modeStampClosure(memdir, keysCsv) {
  const report = { stamped: 0, missing: [], already_closed: [] };
  const keys = (keysCsv || '').split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return report;
  const text = readFile(memdir, 'backlog');
  if (!text) {
    report.missing = [...keys];
    return report;
  }
  let newText = text;
  const today = todayIso();
  for (const key of keys) {
    const block = findEntryBlock(newText, key);
    if (block === null) {
      report.missing.push(key);
      continue;
    }
    const wasStamped = (readFieldValue(block, 'status') || '').trim() === 'picked-up';
    let updated = updateField(block, 'status', 'picked-up');
    updated = updateField(updated, 'superseded-at', today);
    newText = newText.replace(block, updated);
    if (wasStamped) report.already_closed.push(key);
    else report.stamped += 1;
  }
  if (newText !== text) writeFile(memdir, 'backlog', newText);
  return report;
}

function applyStaleAction(text, block, name, reply, head, today, report) {
  if (reply === 're-verify') {
    let updated = updateField(block, 'verified-at', head || 'HEAD');
    updated = updateField(updated, 'last-touched', today);
    report.reverified += 1;
    return text.replace(block, updated);
  }
  if (reply === 'delete') {
    report.deleted += 1;
    return deleteBlock(text, block);
  }
  if (reply === 'mark-closed') {
    const field = closureFieldFor(name);
    const updated = updateField(block, field, today);
    report.mark_closed += 1;
    return text.replace(block, updated);
  }
  report.kept += 1;
  return text;
}

function modeBacklogDecay(memdir, thresholdDays) {
  // Backlog is stale-exempt under the default predicate (intent doesn't
  // verify-against code), but unbounded growth still erodes the file. This
  // mode applies an age-based decay to backlog entries by `raised-on:` (or
  // `last-touched:` fallback) and lets the curator decide per entry.
  const report = { surfaced: 0, kept: 0, dropped: 0, picked_up: 0, deferred: 0 };
  const text = readFile(memdir, 'backlog');
  if (!text) return report;
  const today = todayIso();
  const cutoff = Number.isFinite(thresholdDays) ? thresholdDays : BACKLOG_DECAY_DAYS_DEFAULT;
  let newText = text;
  for (const [, block] of splitEntries(text)) {
    if (isClosed(block, 'backlog')) continue;
    const raised = readFieldValue(block, 'raised-on') || readFieldValue(block, 'last-touched');
    const days = raised ? daysSince(raised) : null;
    if (days === null || days < cutoff) continue;
    report.surfaced += 1;
    const reply = stdinReplies();
    if (reply === 'keep') {
      const updated = updateField(block, 'last-touched', today);
      newText = newText.replace(block, updated);
      report.kept += 1;
    } else if (reply === 'drop') {
      let updated = updateField(block, 'status', 'dropped');
      updated = updateField(updated, 'superseded-at', today);
      newText = newText.replace(block, updated);
      report.dropped += 1;
    } else if (reply === 'picked-up') {
      let updated = updateField(block, 'status', 'picked-up');
      updated = updateField(updated, 'superseded-at', today);
      newText = newText.replace(block, updated);
      report.picked_up += 1;
    } else {
      report.deferred += 1;
    }
  }
  if (newText !== text) writeFile(memdir, 'backlog', newText);
  return report;
}

function modeStaleSweep(memdir) {
  const report = { reverified: 0, deleted: 0, mark_closed: 0, kept: 0 };
  const root = dirname(dirname(memdir));
  const head = headSha(root);
  const today = todayIso();
  for (const name of CANONICAL_FILES) {
    const text = readFile(memdir, name);
    if (!text) continue;
    let newText = text;
    for (const [, block] of splitEntries(text)) {
      if (!isStale(block, name, head, root)) continue;
      const reply = stdinReplies();
      newText = applyStaleAction(newText, block, name, reply, head, today, report);
    }
    if (newText !== text) writeFile(memdir, name, newText);
  }
  return report;
}

// --- Foundation: JSON output (Python-compatible spacing) ---------------------
// Python's json.dumps default uses ", " and ": " separators. The parity-test
// harness in tests/run.sh asserts on substrings like `"stamped": 0` with a
// space; default JSON.stringify produces compact output without spaces.
function pyJson(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(pyJson).join(', ') + ']';
  if (typeof v === 'object') {
    const parts = Object.entries(v).map(([k, val]) => `${JSON.stringify(k)}: ${pyJson(val)}`);
    return '{' + parts.join(', ') + '}';
  }
  return JSON.stringify(v);
}

// --- Orchestration -----------------------------------------------------------

const MODE_DISPATCH = {
  'auto-close': modeAutoClose,
  'prose-scan': modeProseScan,
  'stale-sweep': modeStaleSweep,
  'stamp-closure': modeStampClosure,
  'backlog-decay': modeBacklogDecay,
};

function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        mode: { type: 'string' },
        'memory-dir': { type: 'string' },
        'backlog-keys': { type: 'string' },
        'threshold-days': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    process.stderr.write(`sweep: ${err.message}\n`);
    return 2;
  }

  if (!values.mode || !(values.mode in MODE_DISPATCH)) {
    process.stderr.write(`sweep: --mode is required and must be one of ${Object.keys(MODE_DISPATCH).join(', ')}\n`);
    return 2;
  }
  if (!values['memory-dir']) {
    process.stderr.write('sweep: --memory-dir is required\n');
    return 2;
  }
  if (values.mode === 'stamp-closure' && values['backlog-keys'] === undefined) {
    process.stderr.write('sweep: --backlog-keys is required when --mode stamp-closure\n');
    return 2;
  }

  const memdir = resolve(values['memory-dir']);
  let report;
  if (values.mode === 'stamp-closure') {
    report = modeStampClosure(memdir, values['backlog-keys'] || '');
  } else if (values.mode === 'backlog-decay') {
    const raw = values['threshold-days'];
    let n = BACKLOG_DECAY_DAYS_DEFAULT;
    if (raw !== undefined) {
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        process.stderr.write(`sweep: --threshold-days must be a non-negative integer; got "${raw}"\n`);
        return 2;
      }
      n = parsed;
    }
    report = modeBacklogDecay(memdir, n);
  } else {
    report = MODE_DISPATCH[values.mode](memdir);
  }
  process.stdout.write(pyJson(report) + '\n');
  return 0;
}

process.exit(main(process.argv.slice(2)));
