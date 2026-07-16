#!/usr/bin/env node
// Direction Approval Guard — PreToolUse(Write|Edit|MultiEdit)
//
// The gate-collapse (D3/CO-E) rename of spec_approval_guard. The single human
// "direction" gate fires at intake and writes the approval token; the old human
// spec gate is gone (replaced by the machine spec-review oracle stack). Three
// enforcement modes:
//
//   1. Approval artifacts (.claude/state/spec_approvals/*.approval) — only
//      writable when a fresh slug-matched consent marker exists at
//      .claude/state/.direction_approval_grant. The token PATH is reused
//      (D-2) so epic_approval_guard's forge-proof root is preserved.
//
//   2. The marker file itself — Claude SHALL NEVER write it via tool.
//
//   3. Spec files (docs/specs/*.md) — block writes that add/modify an
//      "Approved" / "Status: Approved" line. Consent comes from the user
//      running /approve-direction, never from Claude self-marking a spec.
//
// The shippability / checker-fanout BLOCKED cross-checks that formerly lived
// here (at token-write) are RELOCATED to the harness pre-implementation
// checkpoint (D-6): the token is written at intake, before those verdicts
// exist, so a spec-review verdict cannot be evaluated here.

import { join } from 'node:path';
import { basename } from 'node:path';
import {
  CLAUDE_DOTDIR,
  CONSENT_MARKER_DIRECTION,
  CONSENT_MARKER_DIRECTION_REL,
  readPayload,
  payloadGet,
  canonicalRel,
  canonicalSlug,
  emitAllow,
  emitBlock,
  blockMarkerSelfWrite,
  validateConsentMarker,
  logLine,
  projectGet,
} from './lib/common.mjs';
import { verifyApprovalAnchor } from './lib/approval-anchor.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();
const rel = canonicalRel(file);
if (!rel) emitAllow();

blockMarkerSelfWrite(rel, CONSENT_MARKER_DIRECTION_REL, 'Direction Approval Guard', '/approve-direction <path>');

if (rel.startsWith('.claude/state/spec_approvals/') && rel.endsWith('.approval')) {
  const stem = basename(rel, '.approval');
  const expectedSlug = canonicalSlug(stem);
  validateConsentMarker(CONSENT_MARKER_DIRECTION, 'Direction Approval Guard', '/approve-direction <slug|path>', expectedSlug);

  // A4 provenance-anchor gate (opt-in via governance.approval_provenance.enabled,
  // default false → today's behavior). When enabled, the direction token must
  // resolve to an approval-provenance entry in the slug's evidence ledger.
  // Fail-safe: any unverifiable anchor BLOCKs. This ADDS to the fresh-marker
  // consent already validated above; it never replaces it.
  if (projectGet('governance.approval_provenance.enabled') === true) {
    let tokenContent = '';
    if (tool === 'Write') tokenContent = payloadGet(payload, '.tool_input.content') || '';
    else if (tool === 'Edit') tokenContent = payloadGet(payload, '.tool_input.new_string') || '';
    else if (tool === 'MultiEdit') {
      const edits = payloadGet(payload, '.tool_input.edits') || [];
      tokenContent = edits.map((e) => e.new_string || '').join('\n');
    }
    const ledgerPath = join(CLAUDE_DOTDIR, 'state', 'evidence-ledger', `${expectedSlug}.json`);
    const anchor = verifyApprovalAnchor({ slug: expectedSlug, tokenLines: tokenContent.split(/\r?\n/), ledgerPath });
    if (!anchor.ok) {
      logLine('direction_approval_guard', `BLOCKED approval for '${expectedSlug}': provenance anchor ${anchor.reason}`);
      emitBlock(`Direction Approval Guard: the /approve-direction token for '${expectedSlug}' has no valid provenance anchor (${anchor.reason}). Under governance.approval_provenance.enabled the token must carry a 'ledger_ref:' line resolving to an approval-provenance entry in .claude/state/evidence-ledger/${expectedSlug}.json. Regenerate the token through the provenance flow, then re-run /approve-direction.`);
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
  logLine('direction_approval_guard', `BLOCKED self-approval in: ${rel}`);
  emitBlock(`Direction Approval Guard: Claude cannot mark a spec as Approved. The user must run \`/approve-direction ${rel}\`, which produces the consent marker that allows the approval token to be written. Remove the 'Approved' line from this edit.`);
}

emitAllow();
