#!/usr/bin/env node
// Epic Approval Guard — PreToolUse(Write|Edit|MultiEdit)
//
// Structurally gates the epic `approved: true` flip (seed §18.9). The harness
// SOP flips `approved: true` in .claude/state/epic/<slug>.json after the
// direction gate (/approve-direction).
//
// DEFENSE IN DEPTH, not the load-bearing gate. The flag was demoted: track_guard
// derives an epic-child's authorization from the unforgeable approval token
// (.claude/state/spec_approvals/<slug>.approval), NOT from this boolean — see
// track_guard.mjs:55-56 and seed §18.9. Retiring the trusted boolean is what
// closed the read surface, because a flag forged by any write vector that evades
// this guard (a cd-relative Bash write, say) is now inert where it is read.
// This guard and its Bash-surface twin (destructive_cmd_guard -> writesEpicApproval)
// remain in force so the marker cannot lie: it ALLOWS a transition of `approved`
// to true only when the matching persistent token exists.
//
// That token is itself unforgeable — only direction_approval_guard (which requires
// a fresh consent marker Claude cannot write) permits its creation. Authorization
// is therefore derived from the same forge-proof root as gate A, with no new
// command, no new marker, and no second human approval (spec: Candidate B).
//
// Scope discipline:
//   - Fires ONLY on .claude/state/epic/<slug>.json writes.
//   - Gates ONLY the false->true transition of `approved`. Writes that leave
//     `approved` unchanged (children[] append, status flips) and idempotent
//     re-writes of an already-approved epic pass through ungated.
//   - Existence + slug match only; NO TTL (an approved spec stays approved).

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  STATE_DIR,
  readPayload,
  payloadGet,
  canonicalRel,
  computeProposedContent,
  emitAllow,
  emitBlock,
  logLine,
} from './lib/common.mjs';

const EPIC_STATE_RE = /^\.claude\/state\/epic\/([^/]+)\.json$/;

// True iff the JSON text (or, on parse failure, its raw bytes) sets approved:true.
function hasApprovedTrue(text) {
  if (!text) return false;
  try {
    return JSON.parse(text).approved === true;
  } catch {
    return /"approved"\s*:\s*true\b/.test(text);
  }
}

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();
const rel = canonicalRel(file);
if (!rel) emitAllow();

const m = rel.match(EPIC_STATE_RE);
if (!m) emitAllow();
const slug = m[1];

// Only the false->true transition is gated. Compare proposed vs current state.
const proposedApproved = hasApprovedTrue(computeProposedContent(tool, payload, file));
if (!proposedApproved) emitAllow();

const currentApproved = existsSync(file) ? hasApprovedTrue(readFileSync(file, 'utf8')) : false;
if (currentApproved) emitAllow(); // already approved — not a new transition

const tokenPath = join(STATE_DIR, 'spec_approvals', `${slug}.approval`);
if (existsSync(tokenPath)) {
  logLine('epic_approval_guard', `ALLOWED approved:true flip for '${slug}' (token present: ${basename(tokenPath)})`);
  emitAllow();
}

logLine('epic_approval_guard', `BLOCKED approved:true flip for '${slug}': no approval token`);
emitBlock(`Epic Approval Guard: cannot set \`approved: true\` on the epic state for '${slug}' — no direction-approval token at .claude/state/spec_approvals/${slug}.approval. The epic's discovery-skip authorization is granted only by a real direction-gate approval. Run \`/approve-direction docs/intake/${slug}.md\` first; that produces the persistent token this guard requires. The token is itself unforgeable (direction_approval_guard blocks self-writes), so this gate cannot be satisfied without genuine consent.`);
