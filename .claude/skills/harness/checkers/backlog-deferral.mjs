// An assistant deferral must name its reason (spec skill-character-doctrine, AC-009..012).
//
// Enforce-on-touch is not coded anywhere below: changedFiles is the only input, so an
// entry the diff never touched is an entry this checker never reads. The 57 entries
// predating the rule stay untagged until someone reopens one.

import { normalizeFinding } from '../../spec-diagram-review/oracle.mjs';

export const phase = 'code-review';

const BACKLOG_PREFIX = '.claude/memory/backlog/';
const REASONS = ['dependency', 'risk', 'cost', 'human-directed'];
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

// A finding's text reaches an operator's terminal, and a backlog entry is
// repository-controlled — `memory_stop.mjs` writes them from conversation text.
// Left raw, `ESC [2K ESC [1G` in a key erases the line printed above the finding and
// forges a passing row. Controls become spaces BEFORE the collapse absorbs them,
// because ESC and BEL are not whitespace and `\s+` alone leaves them intact.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/gu;
const FIELD_WIDTH = 96;

function safe(text) {
  const flat = String(text ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return flat.length <= FIELD_WIDTH ? flat : `${flat.slice(0, FIELD_WIDTH - 1)}…`;
}

export function run({ changedFiles } = {}) {
  const findings = [];
  for (const file of Array.isArray(changedFiles) ? changedFiles : []) {
    if (!file?.path?.startsWith(BACKLOG_PREFIX) || !file.path.endsWith('.md')) continue;
    const detail = inspect(file.content);
    if (detail) findings.push(finding(file, detail));
  }
  return { findings };
}

function inspect(content) {
  const block = FRONTMATTER_RE.exec(String(content ?? ''));
  if (!block) return { check: 'backlog_frontmatter', reason: 'frontmatter is unterminated or absent' };

  const fields = parseFields(block[1]);
  if (fields.source !== 'assistant-deferral') return null;

  const deferred = fields.deferred;
  if (deferred === undefined) {
    return { check: 'deferral_untagged', reason: 'carries no `deferred:` key' };
  }
  if (!REASONS.includes(deferred)) {
    return { check: 'deferral_invalid_reason', reason: `\`deferred: ${safe(deferred)}\` is outside the closed list` };
  }
  return null;
}

function parseFields(text) {
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-z][a-z0-9_-]*):\s*(.*)$/i.exec(line);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

function finding(file, { check, reason }) {
  const key = safe(keyOf(file));
  return normalizeFinding({
    check,
    file: file.path,
    line: null,
    evidence: `${key}: ${reason}`,
    message: `Backlog entry \`${key}\` ${reason} — an assistant deferral names why it was left.`,
    suggested_fix: `Add \`deferred: ${REASONS.join('|')}\` to the entry's frontmatter, or do the work now.`,
    artifact: { kind: 'backlog-deferral', locus: key },
  }, { mandatory: true });
}

function keyOf(file) {
  const fromFrontmatter = /^key:\s*(\S+)/m.exec(String(file.content ?? ''));
  if (fromFrontmatter) return fromFrontmatter[1];
  return file.path.slice(BACKLOG_PREFIX.length).replace(/\.md$/, '');
}
