#!/usr/bin/env node
// Epic Approval Guard — PreToolUse(Write|Edit|MultiEdit)
//
// Structurally gates the epic `approved: true` flip (seed §18.9). The harness
// SOP flips `approved: true` in .claude/state/epic/<slug>.json after gate-A
// /approve-spec; track_guard reads that flag to let an epic-child skip mandatory
// discovery. A flag set WITHOUT a real gate-A would let a child skip discovery,
// so this guard makes the flip un-forgeable: it ALLOWS a transition of `approved`
// to true only when the matching persistent token .claude/state/spec_approvals/
// <slug>.approval exists.
//
// That token is itself unforgeable — only spec_approval_guard (which requires a
// fresh consent marker Claude cannot write) permits its creation. Authorization
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
emitBlock(`Epic Approval Guard: cannot set \`approved: true\` on the epic state for '${slug}' — no spec-approval token at .claude/state/spec_approvals/${slug}.approval. The epic's discovery-skip authorization is granted only by a real gate-A approval. Run \`/approve-spec docs/specs/${slug}.md\` first; that produces the persistent token this guard requires. The token is itself unforgeable (spec_approval_guard blocks self-writes), so this gate cannot be satisfied without genuine consent.`);
