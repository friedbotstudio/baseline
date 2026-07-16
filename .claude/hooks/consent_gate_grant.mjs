#!/usr/bin/env node
// Consent Gate Grant — UserPromptSubmit
//
// JS port of consent_gate_grant.sh, adding a fourth arm for /grant-push.
//
// When the user types one of /approve-direction, /approve-swarm, /grant-commit,
// /grant-push, this hook fires BEFORE Claude is invoked. It writes a
// short-lived consent marker at .claude/state/.<gate>_grant.
//
// The marker is what makes the corresponding approval-token write succeed:
// the gate-specific PreToolUse guard (direction_approval_guard, swarm_approval_guard,
// git_commit_guard) reads the marker and allows Claude's write only if a
// fresh, slug-matched marker is on disk.
//
// Why the marker is unforgeable by Claude:
//   - This hook runs on UserPromptSubmit, OUTSIDE Claude's tool boundary.
//   - The PreToolUse guards block Claude from writing the marker file.
//   - Markers expire after consent.gate_marker_ttl_seconds (default 120).
//
// Marker shapes:
//   .spec_approval_grant   line 1: slug · line 2: epoch · line 3: abs spec path
//   .swarm_approval_grant  line 1: slug · line 2: epoch
//   .commit_consent_grant  line 1: epoch · line 2: optional note
//   .push_consent_grant    line 1: epoch · line 2: optional note   (NEW)

import { join } from 'node:path';
import {
  readPayload,
  payloadGet,
  canonicalSlug,
  writeMarkerAtomic,
  logLine,
  CLAUDE_PROJECT_ROOT,
  CONSENT_MARKER_DIRECTION,
  CONSENT_MARKER_SWARM,
  CONSENT_MARKER_COMMIT,
  CONSENT_MARKER_PUSH,
} from './lib/common.mjs';
import { buildGrantCommitMarkerLines, resolveWorkflow } from './lib/consent-decision.mjs';

const HOOK = 'consent_gate_grant';

async function main() {
  // Fast-path: rule out 99% of prompts before any regex parsing.
  const payload = await readPayload();
  const prompt = payloadGet(payload, '.prompt');
  if (typeof prompt !== 'string' || prompt.length === 0) return;
  if (!/\/(approve-direction|approve-swarm|grant-commit|grant-push)/.test(prompt)) return;

  const firstLine = prompt.split(/\r?\n/)[0].trim();
  const now = Math.floor(Date.now() / 1000);

  let m;

  // Gate-collapse (D3/CO-E): the direction gate replaces the old /approve-spec
  // gate and fires at intake. The arg resolves to the intake doc (the direction
  // is authorized from the intake + CO-A evidence); a bare slug defaults to
  // docs/intake/<slug>.md, a path is honored verbatim.
  m = firstLine.match(/^\/approve-direction\s+(\S+)/);
  if (m) {
    const arg = m[1];
    const slug = canonicalSlug(arg);
    let absPath;
    if (arg.startsWith('/')) absPath = arg;
    else if (arg.includes('/')) absPath = join(CLAUDE_PROJECT_ROOT, arg);
    else absPath = join(CLAUDE_PROJECT_ROOT, 'docs', 'intake', `${slug}.md`);
    if (writeMarkerAtomic(CONSENT_MARKER_DIRECTION, slug, String(now), absPath)) {
      logLine(HOOK, `wrote direction_approval_grant slug=${slug} path=${absPath}`);
    } else {
      logLine(HOOK, `FAILED write direction_approval_grant slug=${slug}`);
    }
    return;
  }

  m = firstLine.match(/^\/approve-swarm\s+(\S+)/);
  if (m) {
    const slug = canonicalSlug(m[1]);
    if (writeMarkerAtomic(CONSENT_MARKER_SWARM, slug, String(now))) {
      logLine(HOOK, `wrote swarm_approval_grant slug=${slug}`);
    } else {
      logLine(HOOK, `FAILED write swarm_approval_grant slug=${slug}`);
    }
    return;
  }

  m = firstLine.match(/^\/grant-commit(\s.*)?$/);
  if (m) {
    const note = (m[1] || '').trim();
    // Source the workflow slug from workflow.json (never a user argument). Inside a
    // workflow the marker is slug-first; ad-hoc (no workflow) it is epoch-first.
    const slug = resolveWorkflow(CLAUDE_PROJECT_ROOT).slug;
    const lines = buildGrantCommitMarkerLines(slug, now, note);
    if (writeMarkerAtomic(CONSENT_MARKER_COMMIT, ...lines)) {
      logLine(HOOK, `wrote commit_consent_grant slug=${slug || 'none'} note=${note}`);
    } else {
      logLine(HOOK, `FAILED write commit_consent_grant`);
    }
    return;
  }

  m = firstLine.match(/^\/grant-push(\s.*)?$/);
  if (m) {
    const note = (m[1] || '').trim();
    if (writeMarkerAtomic(CONSENT_MARKER_PUSH, String(now), note)) {
      logLine(HOOK, `wrote push_consent_grant note=${note}`);
    } else {
      logLine(HOOK, `FAILED write push_consent_grant`);
    }
    return;
  }
}

main().catch(() => {
  // UserPromptSubmit hook must never fail loudly — silent exit on any error.
  process.exit(0);
});
