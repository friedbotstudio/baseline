// consent-decision.mjs — Foundation: workflow-scoped commit-consent with a
// time-window fallback. Generalizes the ERP's ADR-0033.
//
// The ERP bound commit consent to the active workflow slug and FAILED CLOSED when
// no workflow was present. That only stays usable when feature branches are left
// unprotected (so the slug check never fires on ad-hoc commits). On a project that
// protects every branch, fail-closed-on-no-workflow forbids every ad-hoc commit.
//
// This module generalizes the decision across three workflow states:
//   - absent      (no .claude/state/workflow.json)      -> time-window fallback
//   - present+slug (readable, carries a slug)            -> slug-scoped match
//   - present+broken (unreadable / unparseable / no slug) -> fail closed
//
// So one /grant-commit authorizes every commit in an active workflow's landing
// (and only that workflow), while an ad-hoc commit outside any workflow still works
// under the classic human-consented time window. Split out of the hooks so it is
// import-safe (no main()) and unit-testable.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalSlug } from './common.mjs';

// Parse a commit_consent token. Two on-disk shapes are accepted:
//   slug-mode:   line1 = workflow slug, line2 = epoch   (written inside a workflow)
//   epoch-only:  line1 = epoch                          (ad-hoc / legacy token)
// epoch-only yields slug:'' so it is usable in the time-window fallback but can
// never satisfy a slug match ('' === live can never hold — decideCommitConsent guards it).
export function parseCommitConsentToken(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const l0 = (lines[0] || '').trim();
  const l1 = (lines[1] || '').trim();
  const l1Epoch = /^\d+$/.test(l1) ? parseInt(l1, 10) : null;
  if (l1Epoch == null && /^\d+$/.test(l0)) {
    return { slug: '', epoch: parseInt(l0, 10) }; // epoch-only shape
  }
  return { slug: l0, epoch: l1Epoch };
}

// Decide whether a protected-branch commit is allowed.
//   workflow: { present: bool, slug: string, readable: bool } from resolveWorkflow()
// Every deny path fails closed; the time-window branch still requires a fresh,
// human-granted token epoch.
export function decideCommitConsent({ token, workflow, now, ttl }) {
  // 1. No workflow context -> time-window fallback (ad-hoc, human-consented).
  if (!workflow || !workflow.present) {
    if (!token || token.epoch == null || !Number.isFinite(token.epoch)) {
      return { allow: false, mode: 'time-window', reason: 'no valid consent epoch' };
    }
    const age = now - token.epoch;
    if (age > ttl) return { allow: false, mode: 'time-window', reason: `consent expired (${age}s old, TTL ${ttl}s)` };
    return { allow: true, mode: 'time-window', reason: `time-window consent (${age}s old; no active workflow)` };
  }

  // 2. Workflow context present but unreadable / carries no slug -> fail closed.
  const live = (workflow.slug || '').trim();
  if (!workflow.readable || !live) {
    return { allow: false, mode: 'slug', reason: 'workflow.json present but unreadable or carries no slug' };
  }

  // 3. Workflow context present with a slug -> slug-scoped match.
  if (!token || !token.slug) return { allow: false, mode: 'slug', reason: 'consent token carries no workflow slug (re-run /grant-commit inside the workflow)' };
  if (token.epoch == null || !Number.isFinite(token.epoch)) return { allow: false, mode: 'slug', reason: 'consent token has no valid epoch' };
  if (token.slug !== live) return { allow: false, mode: 'slug', reason: `consent was granted for workflow '${token.slug}', not '${live}'` };
  const age = now - token.epoch;
  if (age > ttl) return { allow: false, mode: 'slug', reason: `consent expired (${age}s old, TTL ${ttl}s)` };
  return { allow: true, mode: 'slug', reason: `workflow-scoped consent for '${live}' (${age}s old)` };
}

// Build the /grant-commit marker lines written by consent_gate_grant.
//   inside a workflow -> [slug, epoch, note]  (slug-mode; validateConsentMarker slug-checks it)
//   no workflow       -> [epoch, note]        (epoch-mode; matches validateConsentMarker default)
// The slug is sourced from workflow.json (never a user argument).
export function buildGrantCommitMarkerLines(slug, now, note) {
  const s = canonicalSlug(slug || '');
  return s ? [s, String(now), note || ''] : [String(now), note || ''];
}

// IO adapter: resolve the live workflow context. Distinguishes a genuinely-absent
// workflow (ENOENT -> fallback) from a present-but-broken one (-> fail closed), which
// is the split the ERP's single catch conflated.
export function resolveWorkflow(rootDir) {
  const path = join(rootDir, '.claude', 'state', 'workflow.json');
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { present: false, slug: '', readable: true }; // no workflow -> fallback
    return { present: true, slug: '', readable: false }; // unreadable (EACCES/EISDIR/...) -> fail closed
  }
  try {
    const slug = canonicalSlug(JSON.parse(raw).slug || '');
    return { present: true, slug, readable: true };
  } catch {
    return { present: true, slug: '', readable: false }; // present but unparseable -> fail closed
  }
}
