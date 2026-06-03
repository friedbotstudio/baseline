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

import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
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

// Atomic JSON write: serialize to a sibling temp file, then rename over the
// target. rename(2) is atomic on POSIX, so a crash mid-write can never leave a
// half-written / corrupt JSON state file — a reader sees either the old bytes
// or the complete new bytes. Mirrors writeMarkerAtomic. Throws on failure (after
// cleaning the temp) so callers that need the write to land see the error rather
// than silently continuing on stale state.
export function writeJsonAtomic(path, obj) {
  const tmp = `${path}.tmp.${process.pid}`;
  try {
    writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch {}
    throw err;
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

// Reconstruct the post-write content of a file for content-aware guards.
// For Write: tool_input.content. For Edit: apply old_string→new_string to the
// current on-disk file. For MultiEdit: same, applied sequentially.
// Returns the empty string for unrecognized tools or read failures.
export function computeProposedContent(tool, payload, filePath) {
  const ti = payloadGet(payload, '.tool_input') || {};
  const current = () => {
    try { return readFileSync(filePath, 'utf8'); } catch { return ''; }
  };
  if (tool === 'Write') return ti.content || '';
  if (tool === 'Edit') {
    const base = current();
    const oldStr = ti.old_string || '';
    const newStr = ti.new_string || '';
    if (ti.replace_all) return base.split(oldStr).join(newStr);
    return base.includes(oldStr) ? base.replace(oldStr, newStr) : base + newStr;
  }
  if (tool === 'MultiEdit') {
    let content = current();
    for (const edit of (ti.edits || [])) {
      const oldStr = edit.old_string || '';
      const newStr = edit.new_string || '';
      if (edit.replace_all) content = content.split(oldStr).join(newStr);
      else content = content.includes(oldStr) ? content.replace(oldStr, newStr) : content + newStr;
    }
    return content;
  }
  return '';
}

// True if `cmd` matches any pattern in `patterns` (a JS array of regex strings).
// Used by destructive_cmd_guard for project.json destructive patterns.
// Returns false if patterns is null/undefined/empty or all patterns are invalid.
export function cmdMatchesAny(cmd, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  for (const p of patterns) {
    if (typeof p !== 'string' || p === '') continue;
    let re;
    try { re = new RegExp(p); } catch { continue; }
    if (re.test(cmd)) return true;
  }
  return false;
}

// Split a shell command line into top-level segments on UNQUOTED separators
// (; | || & && and newline). Quote-aware so separators inside '...' / "..."
// stay literal. Not a full shell grammar — sufficient to find which segment a
// command verb leads. Quotes are preserved in the returned segment text.
function splitShellSegments(cmd) {
  const segs = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '\n' || c === ';') { segs.push(cur); cur = ''; continue; }
    if (c === '|') { if (cmd[i + 1] === '|') i++; segs.push(cur); cur = ''; continue; }
    if (c === '&') { if (cmd[i + 1] === '&') i++; segs.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) segs.push(cur);
  return segs;
}

// Quote-aware tokenizer: splits on unquoted whitespace and STRIPS quotes, so a
// quoted command argument (`sh -c "git commit"`) survives as one dequoted token
// (`git commit`). Unlike a naive split(/\s+/), this lets executor arguments be
// extracted and re-parsed.
function shellTokens(s) {
  const toks = [];
  let cur = '';
  let q = null;
  let has = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; else cur += c; has = true; continue; }
    if (c === '"' || c === "'") { q = c; has = true; continue; }
    if (/\s/.test(c)) { if (has) { toks.push(cur); cur = ''; has = false; } continue; }
    cur += c; has = true;
  }
  if (has) toks.push(cur);
  return toks;
}

// Command tokens of a fragment after stripping leading `VAR=val` env-assignment
// prefixes. The verb is `commandTokens(frag)[0]`.
function commandTokens(s) {
  const toks = shellTokens(s);
  let i = 0;
  while (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i])) i++;
  return toks.slice(i);
}

// The contents of command substitutions `$( … )` and backtick spans that the
// shell would ACTUALLY execute — i.e. NOT inside single quotes (single quotes
// make `$(`/backtick literal; double quotes do not). Quote-aware so that a
// `$(git commit)` appearing inside a single-quoted string (data, e.g. a for-loop
// list item or an echo literal) is NOT mistaken for an executed command. This is
// the quoting-context the Q-003 fix demands applied to substitution detection.
function extractSubstitutions(s) {
  const out = [];
  let i = 0;
  let sq = false; // inside single quotes (double quotes do not suppress substitution)
  while (i < s.length) {
    const c = s[i];
    if (sq) { if (c === "'") sq = false; i++; continue; }
    if (c === "'") { sq = true; i++; continue; }
    if (c === '$' && s[i + 1] === '(') {
      let depth = 1;
      let j = i + 2;
      let inner = '';
      while (j < s.length && depth > 0) {
        if (s[j] === '(') depth++;
        else if (s[j] === ')') { depth--; if (depth === 0) break; }
        inner += s[j];
        j++;
      }
      out.push(inner);
      i = j + 1;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let inner = '';
      while (j < s.length && s[j] !== '`') { inner += s[j]; j++; }
      out.push(inner);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

// Executors whose command arrives via a `-c <string>` argument.
const SHELL_C_EXECUTORS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
// Executors that PREFIX a command as their remaining argv (the command is what
// follows, after the executor's own option flags / env assignments).
const PREFIX_EXECUTORS = new Set([
  'command', 'env', 'sudo', 'doas', 'nice', 'time', 'nohup', 'setsid', 'xargs', 'timeout', 'stdbuf', 'ionice',
]);

// Every command line that `cmd` actually EXECUTES, dequoted and flattened.
// Beyond the top-level segments this peels subshells `( … )` / brace groups
// `{ …; }`, extracts command-substitution `$( … )` and backtick bodies, and
// recurses into executor wrappers (`sh -c "…"`, `eval "…"`, `command git …`).
// Backslash-newline line-continuations are normalized first. This is what makes
// a wrapped `git commit` classify as a commit (security HIGH fix) WITHOUT
// re-introducing the Q-003 false-positive: only EXECUTED strings recurse, so a
// `grep "git commit"` pattern or an `echo "git commit"` literal stays data.
function executedFragments(cmd, depth = 0) {
  if (!cmd || depth > 6) return [];
  const src = depth === 0 ? cmd.replace(/\\\r?\n/g, ' ') : cmd;
  const frags = [];
  for (const seg of splitShellSegments(src)) {
    let s = seg.trim();
    let changed = true;
    while (changed) {
      changed = false;
      if (s.startsWith('(')) { s = s.slice(1).replace(/\)\s*$/, '').trim(); changed = true; }
      else if (s.startsWith('{')) { s = s.slice(1).replace(/;?\s*\}\s*$/, '').trim(); changed = true; }
    }
    if (!s) continue;
    frags.push(s);
    for (const inner of extractSubstitutions(s)) frags.push(...executedFragments(inner, depth + 1));
    const toks = commandTokens(s);
    const verb = toks[0];
    if (verb === 'eval') {
      frags.push(...executedFragments(toks.slice(1).join(' '), depth + 1));
    } else if (SHELL_C_EXECUTORS.has(verb)) {
      const ci = toks.indexOf('-c');
      if (ci >= 0 && toks[ci + 1] != null) frags.push(...executedFragments(toks[ci + 1], depth + 1));
    } else if (PREFIX_EXECUTORS.has(verb)) {
      frags.push(...executedFragments(toks.slice(1).join(' '), depth + 1));
    }
  }
  return frags;
}

// True iff the token list is a `git <sub>` invocation, skipping git global
// flags (-C <path>, -c <kv>, --git-dir <p>, etc.) before reading the subcommand.
function tokensAreGitSub(toks, sub) {
  if (toks[0] !== 'git') return false;
  let j = 1;
  while (j < toks.length) {
    const t = toks[j];
    if (t === '-C' || t === '-c' || t === '--git-dir' || t === '--work-tree' || t === '--namespace') { j += 2; continue; }
    if (t.startsWith('-')) { j += 1; continue; }
    break;
  }
  return toks[j] === sub;
}

// The executed command fragments whose verb is `git`. Used to scope
// FORBIDDEN-flag regex checks to ACTUAL git invocations (including wrapped ones).
export function gitSegments(cmd) {
  if (!cmd) return [];
  return executedFragments(cmd).filter((f) => commandTokens(f)[0] === 'git');
}

// True iff `cmd` actually invokes `git <sub>` (e.g. `git commit`, `git push`) —
// directly OR wrapped in an executor / substitution / subshell — NOT a mere
// substring match. Q-003 + security-HIGH fix: `grep "git commit"` and
// `echo "git commit"` stay unclassified (data, not executed); `sh -c "git
// commit"`, `eval "git commit"`, `(git commit)`, `echo $(git commit)` classify.
export function gitSubcommandInvoked(cmd, sub) {
  if (!cmd) return false;
  return executedFragments(cmd).some((f) => tokensAreGitSub(commandTokens(f), sub));
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

// --- Consent-path Bash-write detection (consumed by destructive_cmd_guard) ---
//
// A Bash command must not WRITE a consent token/marker — those are produced
// only by the gate flow (the Write tool after /grant-*, /approve-*). The
// reserved consent basenames are detected regardless of how the directory is
// spelled (literal `.claude/state/`, a `$VAR`/`${VAR}` indirection, `~`, etc.),
// so an indirected redirect like `C=.claude/state; echo x > $C/commit_consent`
// cannot evade the check (7f2c MEDIUM). The basename is boundary-anchored
// (`(?![\w.-])`) so a longer filename that merely contains the token as a
// substring (e.g. `commit_consent_notes.txt`) does not match.
const CONSENT_BASENAMES =
  '(?:(?:commit_consent|push_consent|\\.(?:commit_consent|push_consent|spec_approval|swarm_approval)_grant)(?![\\w.-])|spec_approvals/|swarm_approvals/)';
// A reserved consent basename referenced anywhere in the command (the gate;
// a write-signal must ALSO be present for the command to be blocked, so reads
// like `grep commit_consent` or `cat .../commit_consent` pass through).
const CONSENT_REF_RE = new RegExp(CONSENT_BASENAMES);
// A redirect (>, >>, >|) whose target path ends in a reserved consent basename,
// however the leading directory is spelled. `[^'">\s|;&]*?` consumes `$C/`,
// `${HOME}/`, `~/`, a literal path, etc. up to the basename.
const CONSENT_REDIRECT_RE = new RegExp('(?:>>?\\|?)\\s*[\'"]?[^\'">\\s|;&]*?' + CONSENT_BASENAMES);
// Write-verb tokens that, alongside a consent-path reference, signal write
// intent. `cat`/`grep`/`ls`/`head`/`tail` are deliberately ABSENT so reads pass.
const CONSENT_WRITE_VERB_RE = /\b(tee|cp|mv|install|truncate|dd|ln)\b/;
const CONSENT_SED_INPLACE_RE = /\bsed\b[^|;&]*\s-[a-zA-Z]*i/;
// A program write inside `node -e` / `python -c` / `perl -e` / `ruby -e` etc.
const CONSENT_PROG_WRITE_RE = /\b(writeFileSync|appendFileSync|createWriteStream|writeFile)\b|open\s*\([^)]*['"][wa]b?\+?['"]|open\s*\([^)]*,\s*['"]?>>?/;

// Strip the MESSAGE payload of `git commit` segments before consent scanning.
// A commit message that merely DESCRIBES consent tokens (e.g. a governance
// commit body mentioning `commit_consent` and the word `tee`) is not a consent
// write, but the raw command string carries those words and would trip the
// write-signal tests. Two payload sources pollute the command string: an inline
// `-m`/`--message` argument, and a heredoc body feeding the commit (`-F -`).
// Both are removed; everything else — and every NON-commit segment — is kept
// verbatim, so a real write in a compound command (`git commit -m x; tee
// .../commit_consent`) is still caught.

// Remove heredoc bodies whose opener line is a `git commit` invocation. The
// body (and the `<<TAG` opener token) is dropped; the closing TAG line is the
// first line matching `^\s*TAG\s*$`. Non-commit heredocs are left intact.
function stripGitCommitHeredocBodies(cmd) {
  if (!cmd.includes('<<')) return cmd;
  const lines = cmd.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opener = line.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    if (opener && gitSubcommandInvoked(line, 'commit')) {
      const closeRe = new RegExp('^\\s*' + opener[2] + '\\s*$');
      let j = i + 1;
      while (j < lines.length && !closeRe.test(lines[j])) j++;
      if (j >= lines.length) {
        // Unterminated heredoc: strip only the opener token; do NOT swallow the
        // trailing lines (they would otherwise hide a real consent write). The
        // remaining lines are processed normally on subsequent iterations.
        out.push(line.replace(/<<-?\s*['"]?[A-Za-z_][A-Za-z0-9_]*['"]?/, '').trimEnd());
        continue;
      }
      out.push(line.replace(/<<-?\s*['"]?[A-Za-z_][A-Za-z0-9_]*['"]?/, '').trimEnd());
      i = j; // loop ++ steps past the closing TAG line
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

// Every command-substitution / backtick body the shell would EXECUTE in `s`,
// collected recursively (a substitution may nest another). Reuses the
// quote-aware, single-quote-suppressing `extractSubstitutions`. Used so that a
// real consent write hidden inside a commit-message substitution
// (`git commit -m "$(tee .../commit_consent)"`) is NOT lost when the message
// prose is stripped — the executed body is retained for the consent scan.
function collectExecutedSubstitutions(s, depth = 0) {
  if (!s || depth > 6) return [];
  const out = [];
  for (const body of extractSubstitutions(s)) {
    out.push(body);
    out.push(...collectExecutedSubstitutions(body, depth + 1));
  }
  return out;
}

// Drop `-m <arg>` / `-m<arg>` / `--message <arg>` / `--message=<arg>` tokens from
// a single git-commit segment. Returns the dequoted remainder — adequate for
// consent scanning, which only reads the result, never re-executes it.
function stripCommitMessageArgs(seg) {
  const toks = shellTokens(seg);
  const kept = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === '-m' || t === '--message') { i++; continue; } // flag + its separate arg
    if (/^-m./.test(t) || /^--message=/.test(t)) continue;   // -m<joined> / --message=<joined>
    kept.push(t);
  }
  return kept.join(' ');
}

// Neutralize git-commit message payloads in `cmd` so consent scanning sees only
// the executable shape, not the prose. Pure; non-string passes through.
export function sanitizeGitCommitForScan(cmd) {
  if (typeof cmd !== 'string' || cmd === '') return cmd;
  const noHeredoc = stripGitCommitHeredocBodies(cmd);
  const segs = splitShellSegments(noHeredoc).map((seg) =>
    gitSubcommandInvoked(seg, 'commit') ? stripCommitMessageArgs(seg) : seg,
  );
  const scrubbed = segs.join('\n'); // newline is an unquoted separator: segments stay isolated
  // Re-append every EXECUTED substitution body from the ORIGINAL command. A
  // consent write hidden in a message substitution would otherwise vanish with
  // the stripped prose; retaining the executed body keeps it visible to the
  // consent scan (over-inclusion is the safe direction for a security guard).
  const executed = collectExecutedSubstitutions(cmd);
  return executed.length ? `${scrubbed}\n${executed.join('\n')}` : scrubbed;
}

// Expand `$VAR` / `${VAR}` occurrences in `str` against `env`. Unknown names are
// left literal — matching the current scanner's blind spot (a value with no
// literal consent basename is unreachable by any literal scanner; see the spec
// Non-goals). Used both to resolve assignment values and to expand the command.
function expandWithEnv(str, env) {
  return str.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (whole, braced, bare) => {
      const name = braced || bare;
      return env.has(name) ? env.get(name) : whole;
    },
  );
}

// Build a map of shell variable assignments (`VAR=value` at a command-start
// position) to their resolved values. Processed left-to-right so a later value
// referencing an earlier var (`G=$F`) resolves through the map built so far
// (multi-level taint). Quote stripping is best-effort; values with embedded
// whitespace are out of scope (consent paths have none).
function resolveAssignments(scan) {
  const env = new Map();
  const re = /(?:^|[;&|\n(])\s*([A-Za-z_][A-Za-z0-9_]*)=([^\s;&|)]*)/g;
  let m;
  while ((m = re.exec(scan)) !== null) {
    const name = m[1];
    const rawValue = m[2].replace(/^['"]|['"]$/g, '');
    env.set(name, expandWithEnv(rawValue, env));
  }
  return env;
}

// True iff a single executed fragment writes a consent path via a write VERB /
// sed-inplace / programmatic write whose operand is a consent path. Redirects are
// NOT checked here — they are handled whole-command by the caller because the
// `>|` clobber operator embeds a `|` that `splitShellSegments` treats as a pipe,
// splitting the redirect across fragments. Because the caller runs this on the
// VARIABLE-EXPANDED command, a variable-indirected target (`tee $F` where
// `F=.../commit_consent`) is already a literal consent operand here. A fragment
// with no consent reference is never a consent write. Over-inclusion (a consent
// path read-out by `cp consent /tmp`, or a write verb whose operand merely
// co-occurs) is the safe direction for a guard.
function fragmentWritesConsentTarget(fragment) {
  if (!CONSENT_REF_RE.test(fragment)) return false;
  if (CONSENT_WRITE_VERB_RE.test(fragment)) return true;
  if (CONSENT_SED_INPLACE_RE.test(fragment)) return true;
  if (CONSENT_PROG_WRITE_RE.test(fragment)) return true;
  return false;
}

// True iff the Bash command writes (not merely references) a consent
// token/marker. Exported for unit testing and reuse across guards.
//
// Target-anchored: a write blocks only when its RESOLVED target is a consent
// path. Variables are expanded first (so `F=.../commit_consent; tee $F` resolves
// to a literal consent write and blocks). A redirect whose target is a consent
// path is checked whole-command (path-anchored, so no false positive, and robust
// to `>|` splitting). Verb / sed-inplace / programmatic writes are checked per
// executed fragment so that a command which merely READS a consent path in one
// fragment while a write targets something else in another (`head
// .../commit_consent; git mv a b`) is allowed — the consent reference and the
// write signal live in DIFFERENT fragments. The git-commit message carve-out
// (sanitizeGitCommitForScan) is applied first and retained.
export function writesConsentPath(cmd) {
  if (typeof cmd !== 'string') return false;
  const scan = sanitizeGitCommitForScan(cmd);
  const expanded = expandWithEnv(scan, resolveAssignments(scan));
  // This reject MUST stay AFTER expansion — do not "optimize" it onto raw `scan`.
  // A slash-terminated basename (`spec_approvals/`, `swarm_approvals/`) can be
  // ASSEMBLED only at expansion: `VAR=spec_approvals; tee $VAR/x.approval` has no
  // literal `spec_approvals/` in the raw command, so an early raw-scan reject
  // would let it through. Expansion can only INTRODUCE a consent basename whose
  // literal already lives in a `VAR=...` assignment in `scan`, so testing
  // `expanded` is both sound and complete here.
  if (!CONSENT_REF_RE.test(expanded)) return false;
  if (CONSENT_REDIRECT_RE.test(expanded)) return true;
  for (const fragment of executedFragments(expanded)) {
    if (fragmentWritesConsentTarget(fragment)) return true;
  }
  return false;
}

// --- Leaked consent-gate marker sweep (consumed by memory_session_start) ---
//
// Single-use `*_grant` markers are written by consent_gate_grant and consumed
// (deleted) by the matching approval guard. A session that ends after the grant
// but before the guard fired leaves a leaked, replayable consent window; this
// removes any older than the gate-marker TTL. A marker is only ever a regular
// file — a SYMLINK at a marker path is anomalous and is never followed to its
// target (7f2c LOW symlink/TOCTOU): lstat detects the link and only the link is
// removed. Returns the list of swept markers (for the caller to log).
export function sweepLeakedGrantMarkers(stateDir, opts = {}) {
  const ttl = Number.isFinite(opts.ttlSeconds) ? opts.ttlSeconds : 120;
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const names = ['.commit_consent_grant', '.push_consent_grant', '.spec_approval_grant', '.swarm_approval_grant'];
  const swept = [];
  for (const name of names) {
    const grant = join(stateDir, name);
    let st;
    try { st = lstatSync(grant); } catch { continue; } // absent
    if (st.isSymbolicLink()) {
      // Never readFileSync/follow a symlinked marker. Remove the LINK only.
      try { unlinkSync(grant); } catch {}
      swept.push({ name, reason: 'symlink', ageSec: null });
      continue;
    }
    if (!st.isFile()) continue;
    let ageSec = Infinity;
    try {
      const first = readFileSync(grant, 'utf8').split(/\r?\n/)[0].trim();
      if (/^\d+$/.test(first)) ageSec = Math.floor(nowMs / 1000) - parseInt(first, 10);
      else ageSec = Math.floor((nowMs - st.mtimeMs) / 1000);
    } catch {
      ageSec = Math.floor((nowMs - st.mtimeMs) / 1000);
    }
    if (ageSec <= ttl) continue;
    try { unlinkSync(grant); } catch {}
    swept.push({ name, reason: 'expired', ageSec });
  }
  return swept;
}
