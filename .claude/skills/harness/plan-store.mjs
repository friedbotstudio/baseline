// plan-store (Foundation) — durable, append-only, versioned plan object store.
// Persists to .claude/state/plan/<slug>.json (relative to rootDir).
// Resilient readers never throw. Pure validators return {ok, errors[]}.
// Style mirrors evidence-ledger.mjs (append-only, pretty JSON + trailing newline).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { resolveCheckerThreshold, DEFAULT_THRESHOLD } from '../../hooks/lib/tier-dial.mjs';

const SCHEMA_VERSION = 1;

// Same shape as consolidate-open-questions.mjs — one slug shape in the repo, not two.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

// Reject, never repair (CWE-22). Normalizing a hostile slug — the way canonicalSlug
// strips path segments — would MASK the traversal and silently write the plan somewhere
// the caller never asked for. Throwing is the only safe answer. Callers reach this
// through planPath, so every read and write in this module is guarded by construction.
export function assertSafeSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error(
      `plan-store: refusing to build a path from an unsafe slug ${JSON.stringify(slug)} `
      + `(must match ${SLUG_RE})`,
    );
  }
  return slug;
}

function planPath(slug, rootDir) {
  assertSafeSlug(slug);
  return join(rootDir ?? process.cwd(), '.claude', 'state', 'plan', `${slug}.json`);
}

function persistPlan(plan, rootDir) {
  const p = planPath(plan.slug, rootDir);
  mkdirSync(dirname(p), { recursive: true });
  // _rootDir is in-memory plumbing for the persist path — never serialize the
  // absolute machine path into the durable state file. readPlan reinjects it.
  const { _rootDir, ...persisted } = plan;
  writeFileSync(p, JSON.stringify(persisted, null, 2) + '\n');
}

function resolveNodeThresholds(node, tier) {
  const raw = resolveCheckerThreshold(node.checker, { projectJson: { tier: { level: tier } } });
  return { floor: raw.floor, ceiling: raw.ceiling, mandatory: raw.mandatory };
}

function applyThresholds(tasklist, tier) {
  return tasklist.map((node) => ({
    ...node,
    thresholds: node.checker
      ? resolveNodeThresholds(node, tier)
      : { floor: DEFAULT_THRESHOLD.floor, ceiling: DEFAULT_THRESHOLD.ceiling, mandatory: DEFAULT_THRESHOLD.mandatory },
  }));
}

export async function createPlan({ slug, goal, tasklist, tier, rootDir, ts }) {
  const resolvedTs = ts ?? new Date().toISOString();
  const resolvedTasklist = applyThresholds(tasklist, tier);
  const resolvedRootDir = rootDir ?? process.cwd();
  const now = Date.now();
  const plan = {
    schema_version: SCHEMA_VERSION,
    slug,
    tier,
    versions: [
      {
        v: 1,
        ts: resolvedTs,
        author: 'orchestrator',
        reason: 'plan created',
        snapshot: { goal, tasklist: resolvedTasklist },
      },
    ],
    created_at: now,
    updated_at: now,
    artifacts: { round_trips: [], verdicts: {} },
    _rootDir: resolvedRootDir,
  };
  persistPlan(plan, resolvedRootDir);
  return plan;
}

// Ensure the append-only consumer-artifacts channel exists (resilient to plans
// created before the field existed). Returns the channel object on a clone.
function ensureArtifacts(base) {
  if (!base.artifacts || typeof base.artifacts !== 'object') base.artifacts = { round_trips: [], verdicts: {} };
  if (!Array.isArray(base.artifacts.round_trips)) base.artifacts.round_trips = [];
  if (!base.artifacts.verdicts || typeof base.artifacts.verdicts !== 'object') base.artifacts.verdicts = {};
  return base.artifacts;
}

// Migration channel (AC-007): append a consumer round-trip to the plan, append-only.
// Returns the updated plan; the caller's object is not mutated.
export function appendRoundTripArtifact(plan, roundTrip) {
  const base = structuredClone(plan);
  ensureArtifacts(base).round_trips.push(roundTrip);
  base.updated_at = Date.now();
  persistPlan(base, plan._rootDir);
  return base;
}

// Migration channel (AC-008): record a checker verdict on the plan under `key`.
// Returns the updated plan; the caller's object is not mutated.
export function setVerdictArtifact(plan, key, verdict) {
  const base = structuredClone(plan);
  ensureArtifacts(base).verdicts[key] = verdict;
  base.updated_at = Date.now();
  persistPlan(base, plan._rootDir);
  return base;
}

export function readPlan(slug, rootDir) {
  const p = planPath(slug, rootDir);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.schema_version === SCHEMA_VERSION) {
      parsed._rootDir = rootDir ?? process.cwd(); // reinject in-memory persist plumbing
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function currentSnapshot(plan) {
  return plan.versions[plan.versions.length - 1].snapshot;
}

export async function recordRevision(plan, nextSnapshot, { author, reason, ts }) {
  const base = structuredClone(plan);
  const lastV = base.versions[base.versions.length - 1].v;
  const newVersion = { v: lastV + 1, ts: ts ?? new Date().toISOString(), author, reason, snapshot: nextSnapshot };
  const updated = { ...base, versions: [...base.versions, newVersion], updated_at: Date.now() };
  persistPlan(updated, plan._rootDir);
  return updated;
}

export function getVersion(plan, v) {
  const entry = plan.versions.find((ver) => ver.v === v);
  if (!entry) throw new Error(`plan-store: version ${v} not found in plan "${plan.slug}" (versions: ${plan.versions.map((x) => x.v).join(', ')})`);
  return entry.snapshot;
}

export function validatePlan(plan) {
  const errors = [];
  try {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      return { ok: false, errors: ['plan must be a non-null object'] };
    }
    if (plan.schema_version !== SCHEMA_VERSION) {
      errors.push(`schema_version must be ${SCHEMA_VERSION}, got ${plan.schema_version}`);
    }
    if (typeof plan.slug !== 'string' || plan.slug.trim() === '') {
      errors.push('slug must be a non-empty string');
    }
    if (typeof plan.tier !== 'string' || plan.tier.trim() === '') {
      errors.push('tier must be a non-empty string');
    }
    if (!Array.isArray(plan.versions) || plan.versions.length === 0) {
      errors.push('versions must be a non-empty array');
    } else {
      for (let i = 0; i < plan.versions.length; i++) {
        const ver = plan.versions[i];
        const expectedV = i + 1;
        if (ver.v !== expectedV) {
          errors.push(`versions must be strictly increasing from 1: expected v=${expectedV} at index ${i}, got v=${ver.v}`);
        }
        const snap = ver.snapshot;
        if (!snap || !Array.isArray(snap.tasklist)) {
          errors.push(`version v=${ver.v} snapshot.tasklist must be an array`);
          continue;
        }
        const ids = new Set();
        for (const node of snap.tasklist) {
          if (ids.has(node.id)) {
            errors.push(`version v=${ver.v}: duplicate node id "${node.id}"`);
          }
          ids.add(node.id);
        }
        for (const node of snap.tasklist) {
          if (!node.assignment || !Array.isArray(node.assignment.deps)) continue;
          for (const dep of node.assignment.deps) {
            if (!ids.has(dep)) {
              errors.push(`version v=${ver.v}: node "${node.id}" dep "${dep}" references non-existent node id`);
            }
          }
          if (!node.thresholds || typeof node.thresholds.ceiling !== 'number' || typeof node.thresholds.mandatory !== 'boolean') {
            errors.push(`version v=${ver.v}: node "${node.id}" thresholds must have ceiling (number) and mandatory (boolean)`);
          }
          if (node.result !== null && node.result !== undefined) {
            const r = node.result;
            if (!['CLEAN', 'BLOCKED'].includes(r.verdict)) {
              errors.push(`version v=${ver.v}: node "${node.id}" result.verdict must be CLEAN or BLOCKED`);
            }
            if (!Array.isArray(r.findings)) {
              errors.push(`version v=${ver.v}: node "${node.id}" result.findings must be an array`);
            }
            if (typeof r.false_positive_blocks !== 'number') {
              errors.push(`version v=${ver.v}: node "${node.id}" result.false_positive_blocks must be a number`);
            }
          }
        }
      }
    }
  } catch (err) {
    errors.push(`unexpected validation error: ${err.message}`);
  }
  return { ok: errors.length === 0, errors };
}

export function mergeInput(plan) {
  return currentSnapshot(plan)
    .tasklist.filter((node) => node.result !== null && node.result !== undefined)
    .map((node) => ({
      id: node.id,
      mandatory: node.thresholds.mandatory,
      verdict: node.result.verdict,
      findings: node.result.findings,
    }));
}
