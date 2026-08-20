// Foundation — per-phase workflow timing + token accounting
// (phase-timing-instrumentation, Candidate B; token capture: phase-token-instrumentation).
//
// Two pure operations over filesystem state, plus a `render` CLI:
//   stampFromWorkflow — append a completion stamp for each phase newly present in
//                       workflow.json → completed[], carrying cumulative token
//                       totals (output/input/cache-read) read from the session
//                       transcript. Idempotent; never throws.
//   renderTable       — join the stamps + the approve-spec consent-token mtime into
//                       a per-phase markdown table: model-vs-human-wait time plus
//                       per-phase token deltas (out/in/cache).
//
// Timestamps in the JSONL are epoch milliseconds; workflow.json created_at is epoch
// seconds (run-start anchor = created_at * 1000). Consent gates are folded into the
// following work phase's human-wait, never shown as their own rows. The first stamp
// for a slug also writes a `run-start` baseline row anchoring phase-1's token delta:
// its token counts cover only transcript entries timestamped at/before created_at,
// so phase-1 reflects in-workflow work, not the whole pre-workflow session. That
// baseline row carries `ts = created_at * 1000` (falling back to now() when
// created_at is absent or non-finite), so the JSONL stays self-describing for a
// reader that no longer has workflow.json — /commit archives it, and renderTable's
// own runStart derivation is unavailable post-archive.
//
// Every phase row additionally carries:
//   batch_id / batch_size — one stampFromWorkflow call reads the clock and the
//     transcript ONCE and spreads both across every row it emits, so rows in a
//     batch show zero deltas against each other. These fields distinguish "observed
//     together" from "genuinely cost nothing". The baseline row is an anchor, not an
//     observation, and is excluded from batch_size.
//   wait_ms — on a gate phase, the gap since the previous stamp (human wait, since
//     no model work happens while a gate is pending); 0 on every other phase, absent
//     on the baseline. Summing wait_ms over a file yields total human wait with no
//     double-count.

import {
  existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync, statSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeSlug, isSafeSlug } from './slug.mjs';

// `approve-direction` is the post-gate-collapse (D3/CO-E) name for the gate that
// used to be `approve-spec`; both are listed so pre-rename workflows still read
// correctly. The token path is unchanged — the gate still writes
// .claude/state/spec_approvals/<slug>.approval.
const GATE_PHASES = new Set(['approve-direction', 'approve-spec', 'approve-swarm', 'grant-commit']);

// ---- paths -----------------------------------------------------------------

const workflowPath = (rootDir) => join(rootDir, '.claude', 'state', 'workflow.json');
// Both builders validate before composing (backlog -a8d2). stampFromWorkflow reaches
// appendFileSync, so an unguarded traversing wf.slug would append JSONL outside
// .claude/state/timing/. REJECT, never normalize — routing through the slug normalizer
// in common.mjs would mask the traversal by silently redirecting the write.
export const timingPath = (rootDir, slug) =>
  join(rootDir, '.claude', 'state', 'timing', `${assertSafeSlug(slug, 'timing')}.jsonl`);
export const approvalTokenPath = (rootDir, slug) =>
  join(rootDir, '.claude', 'state', 'spec_approvals', `${assertSafeSlug(slug, 'timing')}.approval`);

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

// Best-effort cumulative token total over a session transcript JSONL. Sums
// message.usage.{output,input,cache_read}_tokens across every assistant entry.
// When `beforeMs` is given, only entries with an ISO `timestamp` at or before
// that instant are counted — this yields the run-start anchor (tokens spent
// before the workflow's created_at) so phase-1's delta is real work, not the
// whole pre-workflow session. Returns null (token data absent) on a
// missing/unreadable path or when no qualifying assistant-with-usage entry is
// found. Never throws — a malformed line is skipped.
function sumTranscriptTokens(transcriptPath, beforeMs) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  let raw;
  try {
    raw = readFileSync(transcriptPath, 'utf8');
  } catch {
    return null;
  }
  let out = 0;
  let inp = 0;
  let cache = 0;
  let seen = false;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const usage = entry && entry.type === 'assistant' && entry.message && entry.message.usage;
    if (!usage) continue;
    if (Number.isFinite(beforeMs)) {
      const tsMs = Date.parse(entry.timestamp);
      if (!Number.isFinite(tsMs) || tsMs > beforeMs) continue;
    }
    seen = true;
    out += usage.output_tokens || 0;
    inp += usage.input_tokens || 0;
    cache += usage.cache_read_input_tokens || 0;
  }
  return seen ? { out_tokens: out, in_tokens: inp, cache_tokens: cache } : null;
}

// A phase re-entered by the harness integrate auto-loop leaves `completed[]`
// untouched, so a dedup on the bare phase name recorded nothing for it — across 67
// archived spec runs the timing logs showed zero re-entries. `workflow.json →
// attempts: {"<phase>": <n>}` is the signal: n counts ENTRIES, so attempt 1 is the
// original run the `completed` stamp already covers, and every k in 2..n earns its
// own row labelled `<phase>:attempt-<k>`. Emitting the whole 2..n span rather than
// only the newest means a batched increment cannot silently lose a retry.
//
// The whole field is ignored unless it is a plain object of safe positive integers.
// Timing is best-effort and must never throw into a phase, and MAX_ATTEMPTS keeps a
// nonsense count from spinning out a runaway label list.
const MAX_ATTEMPTS = 100;

function retryLabels(attempts) {
  if (!attempts || typeof attempts !== 'object' || Array.isArray(attempts)) return [];
  const labels = [];
  for (const [phase, count] of Object.entries(attempts)) {
    if (!phase || !Number.isSafeInteger(count) || count < 2) continue;
    for (let k = 2; k <= Math.min(count, MAX_ATTEMPTS); k += 1) labels.push(`${phase}:attempt-${k}`);
  }
  return labels;
}

// The stamp a gate's wait is measured against: the last row already on disk, or
// the run-start baseline when this call is the first for the slug. Every row in
// one call shares a timestamp, so the gap is identical across the batch.
function lastObservedTs(existing, pendingRows) {
  const prior = existing.length > 0 ? existing[existing.length - 1] : pendingRows[0];
  return prior && Number.isFinite(prior.ts) ? prior.ts : 0;
}

// ---- stamp -----------------------------------------------------------------

export function stampFromWorkflow({ rootDir, now = Date.now, transcriptPath, subtickEnabled = true } = {}) {
  const wf = readWorkflow(rootDir);
  if (!wf || !Array.isArray(wf.completed)) return { appended: [] };

  // Guard BEFORE readStamps — it composes timingPath outside its try, so an unsafe
  // slug would throw past this function's documented "never throws" contract. The
  // predicate form (not assertSafeSlug) is what keeps that contract intact: a hostile
  // slug is a skipped stamp, never a crashed phase_timer hook.
  const slug = wf.slug;
  if (!isSafeSlug(slug)) return { appended: [] };

  const existing = readStamps(rootDir, slug);
  const stamped = new Set(existing.map((s) => s.phase));
  const freshCompleted = wf.completed.filter((phase) => !stamped.has(phase));
  const freshSub = subtickEnabled && Array.isArray(wf.tdd_ticks)
    ? wf.tdd_ticks.map((t) => `tdd:${t}`).filter((label) => !stamped.has(label))
    : [];
  const freshRetries = retryLabels(wf.attempts).filter((label) => !stamped.has(label));
  if (freshCompleted.length === 0 && freshSub.length === 0 && freshRetries.length === 0) {
    return { appended: [] };
  }

  const currentTokens = sumTranscriptTokens(transcriptPath) ?? {};
  const ts = now();
  const createdMs = Number.isFinite(wf.created_at) ? wf.created_at * 1000 : undefined;

  const rows = [];
  if (existing.length === 0) {
    const baselineTokens = sumTranscriptTokens(transcriptPath, createdMs) ?? {};
    rows.push({ phase: 'run-start', event: 'baseline', ts: createdMs ?? ts, ...baselineTokens });
  }

  const observed = [
    ...freshSub.map((phase) => [phase, 'sub']),
    ...freshRetries.map((phase) => [phase, 'retry']),
    ...freshCompleted.map((phase) => [phase, 'completed']),
  ];
  const batchId = `${ts}-${existing.length}`;
  const priorTs = lastObservedTs(existing, rows);
  for (const [phase, event] of observed) {
    rows.push({
      phase,
      event,
      ts,
      ...currentTokens,
      wait_ms: GATE_PHASES.has(phase) ? Math.max(0, ts - priorTs) : 0,
      batch_id: batchId,
      batch_size: observed.length,
    });
  }

  const p = timingPath(rootDir, slug);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { appended: [...freshSub, ...freshRetries, ...freshCompleted] };
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

function tokenDelta(prevStamp, curStamp, field) {
  const prev = prevStamp ? prevStamp[field] : undefined;
  const cur = curStamp ? curStamp[field] : undefined;
  return Number.isFinite(prev) && Number.isFinite(cur) ? cur - prev : 'n/a';
}

// Child rows for one parent phase, chained off an anchor. Two kinds ride this:
//   * worker-tick subs (`event:'sub'`, e.g. `tdd:scenario`) anchor at the parent's
//     effective START, so their model deltas sum to the parent rollup in both the
//     plain and the gate-attributed case;
//   * re-entry retries (`event:'retry'`, e.g. `tdd:attempt-2`) anchor at the
//     parent's COMPLETION, because a retry begins where the first attempt ended.
// Either way each subsequent row chains off the previous one.
function childRowsForParent(parentPhase, childStamps, anchorTs, anchorStamp) {
  const subs = childStamps
    .filter((s) => s.phase.startsWith(`${parentPhase}:`))
    .sort((a, b) => a.ts - b.ts);

  const rows = [];
  let prevEnd = anchorTs;
  let prevStamp = anchorStamp;
  for (const cur of subs) {
    rows.push({
      phase: cur.phase,
      model: Math.max(0, cur.ts - prevEnd),
      human: 0,
      tokens: {
        out: tokenDelta(prevStamp, cur, 'out_tokens'),
        in: tokenDelta(prevStamp, cur, 'in_tokens'),
        cache: tokenDelta(prevStamp, cur, 'cache_tokens'),
      },
      sub: true,
    });
    prevEnd = cur.ts;
    prevStamp = cur;
  }
  return rows;
}

function attributeGaps(stamps, { runStart, approveTokenMs, baseline, subStamps = [], retryStamps = [] }) {
  const specIdx = lastSpecFamilyIndex(stamps);
  const gatePhaseIdx = specIdx === -1 ? -1 : firstWorkPhaseAfter(stamps, specIdx);

  const rows = [];
  for (let i = 0; i < stamps.length; i += 1) {
    const cur = stamps[i];
    const { phase, ts } = cur;
    if (GATE_PHASES.has(phase)) continue;

    const prevEnd = i === 0 ? runStart : stamps[i - 1].ts;
    const prevStamp = i === 0 ? baseline : stamps[i - 1];
    const tokens = {
      out: tokenDelta(prevStamp, cur, 'out_tokens'),
      in: tokenDelta(prevStamp, cur, 'in_tokens'),
      cache: tokenDelta(prevStamp, cur, 'cache_tokens'),
    };

    const isGate = i === gatePhaseIdx && approveTokenMs != null;
    const start = isGate ? Math.max(prevEnd, approveTokenMs) : prevEnd;
    if (i === gatePhaseIdx) {
      if (approveTokenMs != null) {
        rows.push({ phase, model: Math.max(0, ts - start), human: Math.max(0, approveTokenMs - prevEnd), tokens });
      } else {
        rows.push({ phase, model: Math.max(0, ts - prevEnd), human: 'n/a', tokens });
      }
    } else {
      rows.push({ phase, model: Math.max(0, ts - prevEnd), human: 0, tokens });
    }

    rows.push(...childRowsForParent(phase, subStamps, start, prevStamp));
    rows.push(...childRowsForParent(phase, retryStamps, ts, cur));
  }
  return rows;
}

export function renderTable({ rootDir, slug }) {
  const allStamps = readStamps(rootDir, slug);
  const baseline = allStamps.find((s) => s.event === 'baseline') || null;
  const stamps = allStamps.filter(
    (s) => s.event !== 'baseline' && s.event !== 'sub' && s.event !== 'retry'
  );
  const subStamps = allStamps.filter((s) => s.event === 'sub');
  const retryStamps = allStamps.filter((s) => s.event === 'retry');
  const wf = readWorkflow(rootDir);
  const runStart = wf && Number.isFinite(wf.created_at) ? wf.created_at * 1000 : 0;
  const approveTokenMs = readApprovalMtimeMs(rootDir, slug);

  const rows = attributeGaps(stamps, { runStart, approveTokenMs, baseline, subStamps, retryStamps });

  const header = [
    `# Phase timing — ${slug}`,
    '',
    '| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |',
    '|---|---|---|---|---|---|',
  ];
  const body = rows.map((r) => {
    const label = r.sub ? `└ ${r.phase}` : r.phase;
    return `| ${label} | ${r.model} | ${r.human} | ${r.tokens.out} | ${r.tokens.in} | ${r.tokens.cache} |`;
  });
  const footer = [
    '',
    '_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._',
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
