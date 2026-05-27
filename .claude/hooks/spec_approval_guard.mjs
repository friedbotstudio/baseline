#!/usr/bin/env node
// Spec Approval Guard — PreToolUse(Write|Edit|MultiEdit)
//
// Three enforcement modes:
//
//   1. Approval artifacts (.claude/state/spec_approvals/*.approval) — only
//      writable when a fresh slug-matched consent marker exists at
//      .claude/state/.spec_approval_grant.
//
//   2. The marker file itself — Claude SHALL NEVER write it via tool.
//
//   3. Spec files (docs/specs/*.md) — block writes that add/modify an
//      "Approved" / "Status: Approved" line. The user must run /approve-spec.

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  CLAUDE_DOTDIR,
  CONSENT_MARKER_SPEC,
  CONSENT_MARKER_SPEC_REL,
  readPayload,
  payloadGet,
  canonicalRel,
  canonicalSlug,
  emitAllow,
  emitBlock,
  blockMarkerSelfWrite,
  validateConsentMarker,
  logLine,
} from './lib/common.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();
const rel = canonicalRel(file);
if (!rel) emitAllow();

blockMarkerSelfWrite(rel, CONSENT_MARKER_SPEC_REL, 'Spec Approval Guard', '/approve-spec <path>');

if (rel.startsWith('.claude/state/spec_approvals/') && rel.endsWith('.approval')) {
  const stem = basename(rel, '.approval');
  const expectedSlug = canonicalSlug(stem);
  validateConsentMarker(CONSENT_MARKER_SPEC, 'Spec Approval Guard', '/approve-spec <slug|path>', expectedSlug);

  // Shippability gate: if /spec-shippability-review ran and stamped BLOCKED,
  // refuse the approval token write with the punch-list summary embedded.
  const shipReport = join(CLAUDE_DOTDIR, 'state', 'spec-shippability', `${expectedSlug}.json`);
  if (existsSync(shipReport)) {
    let report;
    try { report = JSON.parse(readFileSync(shipReport, 'utf8')); } catch { report = null; }
    if (report && report.verdict === 'BLOCKED') {
      const blockers = (report.findings || []).filter((f) => f.severity === 'BLOCKER');
      const head = blockers.slice(0, 3).map((f) => `  - [${f.check}] ${f.message || ''}`);
      const extra = blockers.length > 3 ? `  ...and ${blockers.length - 3} more BLOCKER finding(s)` : '';
      const summary = [...head, ...(extra ? [extra] : [])].join('\n');
      logLine('spec_approval_guard', `BLOCKED approval for '${expectedSlug}': shippability verdict=BLOCKED`);
      emitBlock(`Spec Approval Guard: /spec-shippability-review reports verdict=BLOCKED for slug '${expectedSlug}'. The spec would ship dev-tree references to consumer installs. Fix the BLOCKER findings and re-run /spec-shippability-review until CLEAN before re-running /approve-spec.

BLOCKER findings:
${summary}

Full report: .claude/state/spec-shippability/${expectedSlug}.json`);
    }
  }
  emitAllow();
}

if (!(rel.startsWith('docs/specs/') && rel.endsWith('.md'))) emitAllow();

let content = '';
if (tool === 'Write') content = payloadGet(payload, '.tool_input.content') || '';
else if (tool === 'Edit') content = payloadGet(payload, '.tool_input.new_string') || '';
else if (tool === 'MultiEdit') {
  const edits = payloadGet(payload, '.tool_input.edits') || [];
  content = edits.map((e) => e.new_string || '').join('\n');
}

const selfApproved = content.split(/\r?\n/).some((ln) => {
  const s = ln.trim().replace(/^[-*]\s*/, '').trim();
  if (/^(status|state|approval)\s*[:=]\s*approved\b/i.test(s)) return true;
  if (/^approved\s*[:=]\s*true$/i.test(s)) return true;
  return false;
});
if (selfApproved) {
  logLine('spec_approval_guard', `BLOCKED self-approval in: ${rel}`);
  emitBlock(`Spec Approval Guard: Claude cannot mark a spec as Approved. The user must run \`/approve-spec ${rel}\`, which produces the consent marker that allows the approval token to be written. Remove the 'Approved' line from this edit.`);
}

emitAllow();
