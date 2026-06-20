// Foundation — per-phase workflow timing (phase-timing-instrumentation, Candidate B).
//
// Two pure operations over filesystem state, plus a `render` CLI:
//   stampFromWorkflow — append a completion stamp for each phase newly present in
//                       workflow.json → completed[]. Idempotent; never throws.
//   renderTable       — join the stamps + the approve-spec consent-token mtime into
//                       a per-phase model-vs-human-wait markdown table.
//
// Timestamps in the JSONL are epoch milliseconds; workflow.json created_at is epoch
// seconds (run-start anchor = created_at * 1000). Consent gates are folded into the
// following work phase's human-wait, never shown as their own rows.

import {
  existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync, statSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE_PHASES = new Set(['approve-spec', 'approve-swarm', 'grant-commit']);

// ---- paths -----------------------------------------------------------------

const workflowPath = (rootDir) => join(rootDir, '.claude', 'state', 'workflow.json');
const timingPath = (rootDir, slug) => join(rootDir, '.claude', 'state', 'timing', `${slug}.jsonl`);
const approvalTokenPath = (rootDir, slug) =>
  join(rootDir, '.claude', 'state', 'spec_approvals', `${slug}.approval`);

// ---- readers (every reader degrades to a safe empty value) -----------------

function readWorkflow(rootDir) {
  try {
    return JSON.parse(readFileSync(workflowPath(rootDir), 'utf8'));
  } catch {
    return null;
  }
}

function readStamps(rootDir, slug) {
  const p = timingPath(rootDir, slug);
  if (!existsSync(p)) return [];
  try {
    return readFileSync(p, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function readApprovalMtimeMs(rootDir, slug) {
  try {
    return statSync(approvalTokenPath(rootDir, slug)).mtimeMs;
  } catch {
    return null;
  }
}

// ---- stamp -----------------------------------------------------------------

export function stampFromWorkflow({ rootDir, now = Date.now }) {
  const wf = readWorkflow(rootDir);
  if (!wf || !Array.isArray(wf.completed)) return { appended: [] };

  const slug = wf.slug;
  if (!slug) return { appended: [] };

  const stamped = new Set(readStamps(rootDir, slug).map((s) => s.phase));
  const fresh = wf.completed.filter((phase) => !stamped.has(phase));
  if (fresh.length === 0) return { appended: [] };

  const p = timingPath(rootDir, slug);
  mkdirSync(dirname(p), { recursive: true });
  const lines = fresh
    .map((phase) => JSON.stringify({ phase, event: 'completed', ts: now() }))
    .join('\n');
  appendFileSync(p, lines + '\n');
  return { appended: fresh };
}

// ---- attribution + render --------------------------------------------------

function lastSpecFamilyIndex(stamps) {
  let idx = -1;
  stamps.forEach((s, i) => {
    if (s.phase.startsWith('spec')) idx = i;
  });
  return idx;
}

function firstWorkPhaseAfter(stamps, fromIndex) {
  for (let i = fromIndex + 1; i < stamps.length; i += 1) {
    if (!GATE_PHASES.has(stamps[i].phase)) return i;
  }
  return -1;
}

function attributeGaps(stamps, { runStart, approveTokenMs }) {
  const specIdx = lastSpecFamilyIndex(stamps);
  const gatePhaseIdx = specIdx === -1 ? -1 : firstWorkPhaseAfter(stamps, specIdx);

  const rows = [];
  for (let i = 0; i < stamps.length; i += 1) {
    const { phase, ts } = stamps[i];
    if (GATE_PHASES.has(phase)) continue;

    const prevEnd = i === 0 ? runStart : stamps[i - 1].ts;

    if (i === gatePhaseIdx) {
      if (approveTokenMs != null) {
        rows.push({
          phase,
          model: Math.max(0, ts - Math.max(prevEnd, approveTokenMs)),
          human: Math.max(0, approveTokenMs - prevEnd),
        });
      } else {
        rows.push({ phase, model: Math.max(0, ts - prevEnd), human: 'n/a' });
      }
    } else {
      rows.push({ phase, model: Math.max(0, ts - prevEnd), human: 0 });
    }
  }
  return rows;
}

export function renderTable({ rootDir, slug }) {
  const stamps = readStamps(rootDir, slug);
  const wf = readWorkflow(rootDir);
  const runStart = wf && Number.isFinite(wf.created_at) ? wf.created_at * 1000 : 0;
  const approveTokenMs = readApprovalMtimeMs(rootDir, slug);

  const rows = attributeGaps(stamps, { runStart, approveTokenMs });

  const header = [
    `# Phase timing — ${slug}`,
    '',
    '| Phase | Model (ms) | Human-wait (ms) |',
    '|---|---|---|',
  ];
  const body = rows.map((r) => `| ${r.phase} | ${r.model} | ${r.human} |`);
  const footer = [
    '',
    '_Model = machine time; Human-wait = idle at a consent gate. The grant-commit gate and commit phase land after /archive and are not covered by this render._',
  ];
  return [...header, ...body, ...footer].join('\n') + '\n';
}

// ---- CLI: `node lib/timing.mjs render <slug> [bundleDir]` -------------------

function defaultBundleDir(rootDir, slug) {
  const date = new Date().toISOString().slice(0, 10);
  return join(rootDir, 'docs', 'archive', date, slug);
}

function main(argv) {
  const [cmd, slug, bundleDirArg] = argv;
  if (cmd !== 'render' || !slug) {
    process.stderr.write('usage: node timing.mjs render <slug> [bundleDir]\n');
    process.exit(2);
  }
  const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const bundleDir = bundleDirArg || defaultBundleDir(rootDir, slug);
  try {
    mkdirSync(bundleDir, { recursive: true });
    const out = join(bundleDir, 'timing.md');
    writeFileSync(out, renderTable({ rootDir, slug }));
    process.stdout.write(out + '\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`timing: cannot write timing.md: ${err.message}\n`);
    process.exit(1);
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main(process.argv.slice(2));
