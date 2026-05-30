#!/usr/bin/env node
// Destructive Command Guard — PreToolUse(Bash)
//
// JS port of destructive_cmd_guard.sh. Behavior preserved verbatim; the only
// change is in-process JSON parsing instead of forking python3 5+ times per
// fire. Drops per-call cost from ~4.3 s to ~0.3 s on macOS.
//
// Two tiers (unchanged):
//   - hard_block_patterns: block outright, cannot be overridden here.
//   - ask_patterns: emit an "ask" decision so the user is prompted each time.
//
// Patterns come from .destructive.hard_block_patterns / .destructive.ask_patterns
// in .claude/project.json. Mode selector .destructive.mode is "ask" (default)
// or "block" — block upgrades ask_patterns to deny.

import {
  readPayload,
  payloadGet,
  projectGet,
  emitBlock,
  emitAsk,
  emitAllow,
  logLine,
} from './lib/common.mjs';

function cmdMatchesAny(cmd, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  for (const p of patterns) {
    if (typeof p !== 'string' || p === '') continue;
    let re;
    try { re = new RegExp(p); } catch { continue; }
    if (re.test(cmd)) return true;
  }
  return false;
}

// Finding B — consent tokens/markers may be written ONLY by the gate flow (the
// Write tool, after a /grant-* command primes a marker). The approval guards
// (spec/swarm/git) match only Write|Edit|MultiEdit, so a Bash write to a
// consent path bypasses marker validation entirely. This guard runs on every
// Bash command, so it is the right place to deny Bash writes to consent paths.
// Reads (cat/grep/ls/head/tail) stay allowed — only WRITE intent is blocked.

// A consent path referenced anywhere in the command. Suffix match — works for
// relative, absolute, and $CLAUDE_PROJECT_DIR-prefixed forms alike.
const CONSENT_PATH_RE = new RegExp(
  '\\.claude/state/(' +
    'commit_consent' +
    '|push_consent' +
    '|\\.commit_consent_grant' +
    '|\\.push_consent_grant' +
    '|\\.spec_approval_grant' +
    '|\\.swarm_approval_grant' +
    '|spec_approvals/' +
    '|swarm_approvals/' +
  ')'
);

// Write-verb tokens that, alongside a consent-path reference, signal write
// intent. `cat`/`grep`/`ls`/`head`/`tail` are deliberately ABSENT so reads pass.
const WRITE_VERB_RE = /\b(tee|cp|mv|install|truncate|dd|ln)\b/;
const SED_INPLACE_RE = /\bsed\b[^|;&]*\s-[a-zA-Z]*i/;
// A program write inside `node -e` / `python -c` / `perl -e` / `ruby -e` etc.:
// the JS fs methods, OR an `open(..., 'w'|'a')` (python/ruby), OR an
// `open(..., '>'|'>>'...)` / `open(F,'>path')` (perl). Best-effort — a regex
// guard cannot resolve every interpreter idiom; this covers the common ones.
const PROG_WRITE_RE = /\b(writeFileSync|appendFileSync|createWriteStream|writeFile)\b|open\s*\([^)]*['"][wa]b?\+?['"]|open\s*\([^)]*,\s*['"]?>>?/;
// A redirect (>, >>, or the >| clobber) whose target is a consent path.
const CONSENT_REDIRECT_RE = /(?:>>?\|?)\s*['"]?[^'">\s|;&]*\.claude\/state\/(commit_consent|push_consent|\.(commit_consent|push_consent|spec_approval|swarm_approval)_grant|spec_approvals\/|swarm_approvals\/)/;

function writesConsentPath(cmd) {
  if (!CONSENT_PATH_RE.test(cmd)) return false;
  if (CONSENT_REDIRECT_RE.test(cmd)) return true;
  if (WRITE_VERB_RE.test(cmd)) return true;
  if (SED_INPLACE_RE.test(cmd)) return true;
  if (PROG_WRITE_RE.test(cmd)) return true;
  return false;
}

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (tool !== 'Bash') emitAllow();

const cmd = payloadGet(payload, '.tool_input.command');
if (!cmd) emitAllow();

if (writesConsentPath(cmd)) {
  logLine('destructive_cmd_guard', `BLOCKED consent-path write via Bash: ${cmd}`);
  emitBlock('Destructive Command Guard: this Bash command writes a consent token/marker under .claude/state/. Consent tokens and gate markers are written ONLY by the gate flow — the Write tool after a /grant-commit, /grant-push, /approve-spec, or /approve-swarm command primes a fresh marker. Writing them via Bash would bypass marker validation (the approval guards only match Write/Edit/MultiEdit). Reads are fine; writes are not.');
}

const hard = projectGet('.destructive.hard_block_patterns');
if (cmdMatchesAny(cmd, hard)) {
  logLine('destructive_cmd_guard', `HARD BLOCK: ${cmd}`);
  emitBlock(`Destructive Command Guard: '${cmd}' matches a hard-block pattern (catastrophic/irreversible). This is not overridable by confirmation. If this is genuinely necessary, edit .claude/project.json .destructive.hard_block_patterns.`);
}

let mode = projectGet('.destructive.mode');
if (!mode) mode = 'ask';

const ask = projectGet('.destructive.ask_patterns');
if (cmdMatchesAny(cmd, ask)) {
  if (mode === 'block') {
    logLine('destructive_cmd_guard', `BLOCK (mode=block): ${cmd}`);
    emitBlock(`Destructive Command Guard: '${cmd}' matches a destructive pattern and mode=block. Ask the user to run this themselves, or set .destructive.mode to 'ask' in project.json.`);
  }
  logLine('destructive_cmd_guard', `ASK: ${cmd}`);
  emitAsk(`Destructive Command Guard: '${cmd}' looks destructive (matches an ask pattern). Confirm this is intentional before proceeding.`);
}

emitAllow();
