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
  writesConsentPath,
  writesEpicApproval,
  cmdMatchesAny,
} from './lib/common.mjs';

// Finding B — consent tokens/markers may be written ONLY by the gate flow (the
// Write tool, after a /grant-* command primes a marker). The approval guards
// (spec/swarm/git) match only Write|Edit|MultiEdit, so a Bash write to a
// consent path bypasses marker validation entirely. This guard runs on every
// Bash command, so it is the right place to deny Bash writes to consent paths.
// Reads (cat/grep/ls/head/tail) stay allowed — only WRITE intent is blocked.
// The detector lives in lib/common.mjs (`writesConsentPath`) so it is unit-
// testable and reused; it blocks $VAR-indirected redirects too (7f2c MEDIUM).

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (tool !== 'Bash') emitAllow();

const cmd = payloadGet(payload, '.tool_input.command');
if (!cmd) emitAllow();

if (writesConsentPath(cmd)) {
  logLine('destructive_cmd_guard', `BLOCKED consent-path write via Bash: ${cmd}`);
  emitBlock('Destructive Command Guard: this Bash command writes a consent token/marker under .claude/state/. Consent tokens and gate markers are written ONLY by the gate flow — the Write tool after a /grant-commit, /grant-push, /approve-spec, or /approve-swarm command primes a fresh marker. Writing them via Bash would bypass marker validation (the approval guards only match Write/Edit/MultiEdit). Reads are fine; writes are not.');
}

// epic_approval_guard makes the epic `approved: true` flip un-forgeable on the
// Write|Edit|MultiEdit surface, but it never fires on Bash — so a Bash write to
// .claude/state/epic/<slug>.json setting approved:true would bypass it (and
// track_guard trusts the flag to skip an epic-child's discovery). This guard runs
// on every Bash command, so it is the right place to close that surface, parity
// with the consent-path block above. Only approved:true writes are blocked;
// children[]/status/timestamp writes and reads pass.
if (writesEpicApproval(cmd)) {
  logLine('destructive_cmd_guard', `BLOCKED epic approved:true write via Bash: ${cmd}`);
  emitBlock('Destructive Command Guard: this Bash command sets `approved: true` on epic state under .claude/state/epic/. The epic approval flip is granted ONLY through the gated Write-tool flow — run `/approve-spec docs/specs/<slug>.md`, which produces the persistent spec-approval token that epic_approval_guard requires before it permits the flip. Setting it via Bash would bypass that gate (epic_approval_guard only matches Write/Edit/MultiEdit) and let an epic-child skip mandatory discovery. Writes that leave `approved` unchanged (children/status) and reads are fine.');
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
