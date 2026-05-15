// Shared helpers for baseline Claude Code hook scripts (JS port pilot).
// Imported by .mjs hooks in .claude/hooks/. Bash hooks still source lib/common.sh.
//
// Contract:
//   - Hooks receive a JSON payload on stdin (the Claude Code hook event).
//   - Hooks emit JSON to stdout for structured decisions, or exit non-zero with
//     a stderr message to block/warn.
//   - All hooks must be resilient to a missing/invalid project.json.
//
// Behavior is preserved verbatim from lib/common.sh. The one addition is
// matchAnyGlob — needed by git_commit_guard.mjs for branch policy.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

export const CLAUDE_PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const CLAUDE_DOTDIR = join(CLAUDE_PROJECT_ROOT, '.claude');
export const PROJECT_JSON = join(CLAUDE_DOTDIR, 'project.json');
export const STATE_DIR = join(CLAUDE_DOTDIR, 'state');
export const LOG_DIR = join(STATE_DIR, 'logs');

try { mkdirSync(STATE_DIR, { recursive: true }); } catch {}
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

// Consent-gate marker file paths — written ONLY by consent_gate_grant.mjs
// (UserPromptSubmit), read by the gate guards. Hooks reference these constants
// rather than literal paths so a rename is one-line.
export const CONSENT_MARKER_SPEC   = join(STATE_DIR, '.spec_approval_grant');
export const CONSENT_MARKER_SWARM  = join(STATE_DIR, '.swarm_approval_grant');
export const CONSENT_MARKER_COMMIT = join(STATE_DIR, '.commit_consent_grant');
export const CONSENT_MARKER_PUSH   = join(STATE_DIR, '.push_consent_grant');
export const CONSENT_MARKER_SPEC_REL   = '.claude/state/.spec_approval_grant';
export const CONSENT_MARKER_SWARM_REL  = '.claude/state/.swarm_approval_grant';
export const CONSENT_MARKER_COMMIT_REL = '.claude/state/.commit_consent_grant';
export const CONSENT_MARKER_PUSH_REL   = '.claude/state/.push_consent_grant';

// Read the raw hook JSON payload from stdin. Returns a plain object (empty on parse error).
export async function readPayload() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function dottedLookup(obj, path) {
  if (obj == null) return undefined;
  let cur = obj;
  for (const part of String(path).replace(/^\.+|\.+$/g, '').split('.')) {
    if (part === '') continue;
    if (cur && typeof cur === 'object' && !Array.isArray(cur) && part in cur) {
      cur = cur[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

// Extract a field from the hook payload using a dotted path.
// Usage: payloadGet(payload, '.tool_input.command')
export function payloadGet(payload, path) {
  return dottedLookup(payload, path);
}

// Lazily-loaded project.json cache.
let _projectJsonCache;
let _projectJsonLoaded = false;
function loadProjectJson() {
  if (_projectJsonLoaded) return _projectJsonCache;
  _projectJsonLoaded = true;
  try {
    _projectJsonCache = JSON.parse(readFileSync(PROJECT_JSON, 'utf8'));
  } catch {
    _projectJsonCache = undefined;
  }
  return _projectJsonCache;
}

// Read a field from .claude/project.json at a dotted path.
// Returns undefined if project.json or the key is missing.
export function projectGet(path) {
  return dottedLookup(loadProjectJson(), path);
}

// Emit a structured block decision (PreToolUse). Prints JSON to stdout, exits 0.
export function emitBlock(reason) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: String(reason),
    },
  };
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

// Emit a structured ask decision.
export function emitAsk(reason) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: String(reason),
    },
  };
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

// Emit allow (no-op decision). Equivalent to exit 0 with no output.
export function emitAllow() {
  process.exit(0);
}

// Informational message (stderr, non-blocking).
export function emitInfo(msg) {
  process.stderr.write(String(msg) + '\n');
}

// Append a line to a hook-specific log. Best-effort, never throws.
export function logLine(hook, msg) {
  try {
    const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    appendFileSync(join(LOG_DIR, `${hook}.log`), `${ts}  ${msg}\n`);
  } catch {}
}

// Canonicalize a filepath and make it relative to CLAUDE_PROJECT_ROOT.
// Lexical only — does NOT resolve symlinks (matches the bash helper's
// deliberate choice; symlink-swap defense is a separate hardening).
// Returns the project-relative canonical path, or an absolute canonical
// path if the input escapes the root, or '' if input equals the root.
export function canonicalRel(filepath) {
  if (!filepath) return '';
  const norm = resolve(normalize(filepath));
  const normRoot = resolve(normalize(CLAUDE_PROJECT_ROOT));
  if (norm === normRoot) return '';
  if (norm.startsWith(normRoot + sep)) return norm.slice(normRoot.length + 1);
  return norm;
}

// Reduce a user-typed approval arg (bare slug, filename, or path) to a slug.
//   docs/specs/foo.md  -> foo
//   foo.md             -> foo
//   foo                -> foo
export function canonicalSlug(s) {
  if (s == null) return '';
  let base = String(s);
  const slash = base.lastIndexOf('/');
  if (slash >= 0) base = base.slice(slash + 1);
  if (base.endsWith('.md')) base = base.slice(0, -3);
  return base;
}

// Atomic marker write: temp file + rename. Returns true on success.
export function writeMarkerAtomic(markerPath, ...lines) {
  const tmp = `${markerPath}.tmp.${process.pid}`;
  try {
    writeFileSync(tmp, lines.join('\n') + '\n');
    renameSync(tmp, markerPath);
    return true;
  } catch {
    try { unlinkSync(tmp); } catch {}
    return false;
  }
}

// Block Claude from writing a consent-marker file via Write/Edit/MultiEdit.
// The marker's unforgeability is what makes consent gates structural — only
// consent_gate_grant (UserPromptSubmit, outside Claude's tool boundary) may
// produce it. Calls emitBlock (which exits) on match.
//
// Args: rel — the relative path being written; markerRel — the marker's REL
// constant; gateLabel — human label for the error message ("Git Commit Guard");
// cmdHint — the user command users should run ("/grant-commit").
export function blockMarkerSelfWrite(rel, markerRel, gateLabel, cmdHint) {
  const hookLog = gateLabel.toLowerCase().replace(/\s+/g, '_');
  if (rel === markerRel) {
    logLine(hookLog, `BLOCKED direct write to consent marker: ${rel}`);
    emitBlock(`${gateLabel}: '${rel}' is a consent marker written by the consent_gate_grant UserPromptSubmit hook in response to \`${cmdHint}\`. Claude is not permitted to create or edit this marker — its unforgeability is what makes the gate structurally enforced.`);
  }
}

// Validate a consent marker (freshness + optional slug match) and consume it.
// emitBlocks (exits) on any failure; returns on success after deleting the marker.
// TTL comes from .consent.gate_marker_ttl_seconds (default 120).
//
// Marker shape:
//   - With expectedSlug:  line 1 = slug, line 2 = epoch.
//   - Epoch-only:         line 1 = epoch.
export function validateConsentMarker(markerPath, gateLabel, cmdHint, expectedSlug = '') {
  const hookLog = gateLabel.toLowerCase().replace(/\s+/g, '_');
  let ttl = projectGet('.consent.gate_marker_ttl_seconds');
  if (typeof ttl !== 'number' || !Number.isFinite(ttl)) ttl = 120;

  if (!existsSync(markerPath)) {
    logLine(hookLog, `BLOCKED no marker: ${markerPath}`);
    emitBlock(`${gateLabel}: requires a fresh consent marker at ${markerPath}. The marker is produced by the consent_gate_grant hook when the user runs \`${cmdHint}\` — Claude cannot create it.`);
  }

  let markerSlug = '';
  let markerEpoch;
  try {
    const text = readFileSync(markerPath, 'utf8');
    const lines = text.split(/\r?\n/);
    if (expectedSlug) {
      markerSlug = (lines[0] ?? '').trim();
      markerEpoch = (lines[1] ?? '').trim();
    } else {
      markerEpoch = (lines[0] ?? '').trim();
    }
  } catch {
    markerEpoch = '';
  }

  if (!/^\d+$/.test(markerEpoch)) {
    logLine(hookLog, `BLOCKED malformed marker: ${markerPath}`);
    emitBlock(`${gateLabel}: marker at ${markerPath} is malformed. Ask the user to re-run \`${cmdHint}\`.`);
  }

  const now = Math.floor(Date.now() / 1000);
  const age = now - parseInt(markerEpoch, 10);
  if (age > ttl) {
    logLine(hookLog, `BLOCKED marker expired age=${age}s ttl=${ttl}s`);
    try { unlinkSync(markerPath); } catch {}
    emitBlock(`${gateLabel}: consent marker expired (${age}s old, TTL ${ttl}s). Ask the user to re-run \`${cmdHint}\`.`);
  }

  if (expectedSlug && markerSlug !== expectedSlug) {
    logLine(hookLog, `BLOCKED slug mismatch marker=${markerSlug} expected=${expectedSlug}`);
    emitBlock(`${gateLabel}: marker slug (${markerSlug}) does not match expected (${expectedSlug}). Ask the user to re-run \`${cmdHint}\` with the correct argument.`);
  }

  logLine(hookLog, `ALLOWED marker=${markerPath} age=${age}s slug=${markerSlug || 'N/A'}`);
  try { unlinkSync(markerPath); } catch {}
}

// Hand-rolled shell-glob → RegExp matcher. Used for git.protected_branches.
// `*` matches anything except `/`; `**` matches anything including `/`;
// `?` matches a single non-`/` char; `[...]` is a character class.
// Returns false if globs is null/undefined/empty.
export function matchAnyGlob(name, globs) {
  if (!Array.isArray(globs) || globs.length === 0) return false;
  for (const glob of globs) {
    if (typeof glob !== 'string' || glob === '') continue;
    if (globToRegex(glob).test(name)) return true;
  }
  return false;
}

function globToRegex(glob) {
  let pattern = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        pattern += '.*';
        i += 1;
      } else {
        pattern += '[^/]*';
      }
    } else if (c === '?') {
      pattern += '[^/]';
    } else if (c === '[') {
      let j = i + 1;
      while (j < glob.length && glob[j] !== ']') j++;
      if (j >= glob.length) {
        pattern += '\\[';
      } else {
        pattern += glob.slice(i, j + 1);
        i = j;
      }
    } else if ('.+()^$|\\{}'.includes(c)) {
      pattern += '\\' + c;
    } else {
      pattern += c;
    }
  }
  pattern += '$';
  return new RegExp(pattern);
}
