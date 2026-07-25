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

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalSlug } from './common.mjs';
import { isSafeSlug } from './slug.mjs';

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
// `workflowTtl` bounds the SLUG-scoped branch only; `ttl` still bounds the ad-hoc
// time window. They are separate because the two branches derive their authority
// differently: an ad-hoc grant is bounded only by wall-clock, so its window must stay
// short, while a workflow grant is additionally bounded by the slug it names — one
// landing, and only that landing. A landing legitimately outruns 900s (backlog -7af6
// recorded a ~54-minute one); the ad-hoc window must not stretch to accommodate it.
// Defaults to `ttl` when omitted, so every existing caller keeps today's behavior and
// the 14400s value lives in the hook's config read, not in this pure function.
export function decideCommitConsent({ token, workflow, now, ttl, workflowTtl }) {
  const slugTtl = Number.isFinite(workflowTtl) ? workflowTtl : ttl;
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
  if (age > slugTtl) return { allow: false, mode: 'slug', reason: `consent expired (${age}s old, TTL ${slugTtl}s)` };
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
// Find docs/archive/<date>/<slug>/workflow.json for exactly the slug the consent token
// names. /commit archives workflow.json BEFORE running git commit, so between those two
// steps the live file is gone and workflow scope would otherwise evaporate mid-landing
// (backlog -7af6). Scoping the search to the token's own slug is what keeps this safe:
// it can only revive the workflow the human already granted, never borrow authority
// from a neighbouring bundle. The slug is validated before any path is composed
// (CWE-22) — REJECT, never normalize.
function findArchivedWorkflow(rootDir, slug) {
  if (!isSafeSlug(slug)) return null;
  const archiveRoot = join(rootDir, 'docs', 'archive');
  let dates;
  try {
    dates = readdirSync(archiveRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const date of dates) {
    if (!date.isDirectory()) continue;
    const candidate = join(archiveRoot, date.name, slug, 'workflow.json');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// `tokenSlug` is optional: called with one argument this behaves exactly as before,
// so no un-updated caller changes behavior. The `source` field is added ONLY on the
// archive branch — the live and absent shapes stay three-key, which existing callers
// and tests compare with a strict deepEqual.
export function resolveWorkflow(rootDir, tokenSlug) {
  const path = join(rootDir, '.claude', 'state', 'workflow.json');
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      const archived = findArchivedWorkflow(rootDir, tokenSlug);
      if (archived) {
        try {
          const slug = canonicalSlug(JSON.parse(readFileSync(archived, 'utf8')).slug || '');
          if (slug) return { present: true, slug, readable: true, source: 'archive' };
        } catch { /* unparseable bundle -> fall through to the fallback below */ }
      }
      return { present: false, slug: '', readable: true }; // no workflow -> fallback
    }
    return { present: true, slug: '', readable: false }; // unreadable (EACCES/EISDIR/...) -> fail closed
  }
  try {
    const slug = canonicalSlug(JSON.parse(raw).slug || '');
    return { present: true, slug, readable: true };
  } catch {
    return { present: true, slug: '', readable: false }; // present but unparseable -> fail closed
  }
}
