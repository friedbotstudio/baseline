// Memory Session Start index builder — invoked by memory_session_start.mjs.
//
// Ported from the legacy memory_session_start.py. Reads .claude/memory/,
// computes the index, and returns an additionalContext JSON envelope
// string.
//
// Exports `buildIndex({ memDir, projectRoot, sessionSource })`.

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readMostRecentMarkdown } from './thread_store.mjs';

const CANONICAL = ['landmarks', 'libraries', 'decisions', 'landmines', 'conventions', 'pending-questions', 'backlog'];
const PENDING_FILE = 'pending-questions';
const STALE_EXEMPT_FILES = new Set(['backlog']);
const STALE_COMMITS = 30;
const STALE_DAYS = 30;
const DEFAULT_SIZE_CAP = 500;

function readSizeCap(text) {
  if (!text.startsWith('---')) return DEFAULT_SIZE_CAP;
  const end = text.indexOf('---', 3);
  if (end < 0) return DEFAULT_SIZE_CAP;
  const fm = text.slice(3, end);
  const m = fm.match(/^\s*size-cap:\s*(\d+)\s*$/m);
  return m ? parseInt(m[1], 10) : DEFAULT_SIZE_CAP;
}

function countLines(text) {
  if (!text) return 0;
  return text.endsWith('\n')
    ? text.split('\n').length - 1
    : text.split('\n').length;
}

const FRAMINGS = {
  compact: '↻ Resuming after compaction. Last captured state below — pick up from here.',
  clear:   "↻ Continuity from prior session. The user just `/clear`'d; here is where things stood.",
  resume:  '↻ Session resumed. Last captured state below.',
  startup: '↻ Prior session left this snapshot. If still relevant, pick up from here.',
};

function gitHead(root) {
  try {
    const r = spawnSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (r.status === 0) return (r.stdout || '').trim();
  } catch {}
  return '';
}

function commitDistance(root, stamp) {
  try {
    const r = spawnSync('git', ['-C', root, 'rev-list', '--count', `${stamp}..HEAD`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (r.status !== 0) return null;
    const out = (r.stdout || '').trim();
    if (/^\d+$/.test(out)) return parseInt(out, 10);
  } catch {}
  return null;
}

function daysSince(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const then = Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const today = new Date();
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((todayUTC - then) / 86400000);
}

function getField(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*-\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, 'mi');
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

// Split body on '## <key>...' headings, returning [key, block] pairs.
// Mirrors `re.split(r'(?m)^(##\s+\S.*)$', body)` semantics in the original .py
// closely enough that block boundaries match. The block content includes its
// own heading + everything up to the next heading (or EOF).
function splitBlocks(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const ln of lines) {
    const m = /^##\s+(\S.*)$/.exec(ln);
    if (m) {
      if (cur) out.push(cur);
      const key = m[1].trim().split(/\s+/)[0] || '';
      cur = { key, block: ln + '\n' };
    } else if (cur) {
      cur.block += ln + '\n';
    }
  }
  if (cur) out.push(cur);
  return out.map(({ key, block }) => [key, block]);
}

function isStale(block, name, head, root) {
  if (STALE_EXEMPT_FILES.has(name)) return false;
  const closureField = name === PENDING_FILE ? 'resolved-at' : 'superseded-at';
  if (getField(block, closureField)) return false;
  const stamp = getField(block, 'verified-at');
  if (head && stamp && stamp !== 'HEAD') {
    const dist = commitDistance(root, stamp);
    return dist === null || dist >= STALE_COMMITS;
  }
  // Fallback: date-based decay on `last-touched`. Used for non-git projects
  // AND for git projects where `verified-at: HEAD` means the writer didn't
  // have an actual SHA at stamp time. Closes the prior decay-evasion hatch
  // where `verified-at: HEAD` on a git repo was treated as permanently fresh.
  const days = daysSince(getField(block, 'last-touched') || '');
  return days !== null && days >= STALE_DAYS;
}

function stripFrontmatter(text) {
  // #13: parse line-anchored `^---$` delimiters instead of substring
  // `indexOf('---')`. The previous substring search matched a `---`
  // appearing anywhere — including a body horizontal rule that occurs
  // before the actual frontmatter close — and silently lost content.
  // Strict YAML frontmatter delimiters are bare `---` on their own line.
  if (!text.startsWith('---')) return text;
  const lines = text.split(/\r?\n/);
  if (lines[0].trim() !== '---') return text;
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { closeIdx = i; break; }
  }
  if (closeIdx < 0) return text;
  return lines.slice(closeIdx + 1).join('\n');
}

export function buildIndex({ memDir, projectRoot, sessionSource }) {
  const head = gitHead(projectRoot);

  const rows = [];
  let totalEntries = 0;
  let totalStale = 0;
  const staleRecords = []; // [name, key, lastTouched]
  const overCapRecords = []; // [name, lines, cap]

  for (const name of CANONICAL) {
    const p = join(memDir, `${name}.md`);
    let text;
    try {
      const st = statSync(p);
      if (!st.isFile()) throw new Error('not a file');
      text = readFileSync(p, 'utf8');
    } catch {
      rows.push([name, 0, 0, 'missing']);
      continue;
    }
    const body = stripFrontmatter(text);
    const blocks = splitBlocks(body);
    const n = blocks.length;
    totalEntries += n;
    let stale = 0;
    for (const [key, blk] of blocks) {
      if (!isStale(blk, name, head, projectRoot)) continue;
      stale++;
      staleRecords.push([name, key, getField(blk, 'last-touched') || '']);
    }
    totalStale += stale;
    // Size-cap is a per-file discipline boundary. The README documents that
    // skills SHOULD prune oldest unverified entries when a write exceeds the
    // cap, but no actuator enforces it on write. Surfacing here gives the
    // next skill that touches the file a visible warning to prune in the
    // same write.
    const cap = readSizeCap(text);
    const lineCount = countLines(text);
    let status = 'ok';
    if (lineCount > cap) {
      status = 'over-cap';
      overCapRecords.push([name, lineCount, cap]);
    }
    rows.push([name, n, stale, status]);
  }

  const pendingPath = join(memDir, '_pending.md');
  let pendingCount = 0;
  if (existsSync(pendingPath)) {
    try {
      const body = stripFrontmatter(readFileSync(pendingPath, 'utf8'));
      const m = body.match(/^##\s+CANDIDATE\b/gm);
      pendingCount = m ? m.length : 0;
    } catch {}
  }

  const lines = [];
  lines.push('## Project memory — index (.claude/memory/)');
  lines.push('');
  lines.push(`HEAD: \`${head || 'n/a'}\`  ·  total entries: ${totalEntries}  ·  stale (>=30 commits old): ${totalStale}`);
  lines.push('');
  lines.push('| File | Entries | Stale | Status |');
  lines.push('|---|---:|---:|---|');
  for (const [name, n, stale, status] of rows) {
    lines.push(`| \`${name}.md\` | ${n} | ${stale} | ${status} |`);
  }
  lines.push(`| \`_pending.md\` | ${pendingCount} | — | ok |`);

  if (staleRecords.length) {
    staleRecords.sort((a, b) => {
      const left = (a[2] || '') + `${a[0]}:${a[1]}`;
      const right = (b[2] || '') + `${b[0]}:${b[1]}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });
    const top = staleRecords.slice(0, 5);
    const overflow = staleRecords.length - 5;
    lines.push('');
    lines.push('## Stale entries');
    lines.push('');
    for (const [fname, key, last] of top) {
      const lastPart = last ? ` — last-touched ${last}` : '';
      lines.push(`- \`${fname}.md\` \`${key}\`${lastPart}`);
    }
    if (overflow > 0) lines.push(`… and ${overflow} more`);
  }

  if (overCapRecords.length) {
    overCapRecords.sort((a, b) => (b[1] - b[2]) - (a[1] - a[2])); // worst-overage first
    lines.push('');
    lines.push('## Files over size-cap');
    lines.push('');
    for (const [fname, lc, cap] of overCapRecords) {
      lines.push(`- \`${fname}.md\` — ${lc} lines (cap ${cap}; +${lc - cap})`);
    }
    lines.push('');
    lines.push('Next write to any over-cap file SHOULD prune oldest unverified entries in the same write (per `.claude/memory/README.md → Bounding rules`).');
  }

  lines.push('');

  const workflowJson = join(projectRoot, '.claude/state/workflow.json');
  const activeWorkflow = existsSync(workflowJson);

  // #9: pending nag fires regardless of active-workflow state. The harness
  // is harness-local and never blocks the commit path; this is an advisory.
  // Framing differs per case so the right action is obvious:
  //   - No workflow: candidates carried over from a prior abandoned workflow.
  //   - Active workflow: candidates accumulated in the current session.
  if (pendingCount > 0) {
    const plural = pendingCount === 1 ? '' : 's';
    if (activeWorkflow) {
      lines.push(
        `**${pendingCount} pending memory candidate${plural} accumulated this session** — ` +
        'Phase 10.6 (`/memory-flush`) will flush before commit; curate early with `/memory-flush` if you want.'
      );
    } else {
      lines.push(
        `**${pendingCount} pending memory candidate${plural} carried over from a prior workflow** — ` +
        'run `/memory-flush` to clear before starting new work.'
      );
    }
  }

  // Pending upgrade stages
  let upgradePending = 0;
  const upgradeRoot = join(projectRoot, '.claude/state/upgrade');
  try {
    if (statSync(upgradeRoot).isDirectory()) {
      const entries = readdirSync(upgradeRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = join(upgradeRoot, entry.name, 'manifest.json');
        if (!existsSync(manifestPath)) continue;
        try {
          const stage = JSON.parse(readFileSync(manifestPath, 'utf8'));
          for (const f of (stage.files || [])) {
            if (f && f.status === 'PENDING') upgradePending++;
          }
        } catch {}
      }
    }
  } catch {}

  if (upgradePending > 0) {
    const noun = upgradePending === 1 ? 'file' : 'files';
    lines.push(
      `**${upgradePending} ${noun} staged for /upgrade-project to reconcile** — ` +
      'run `/upgrade-project` when ready.'
    );
  }

  lines.push('');
  lines.push(
    'Files are read on demand by the relevant skill (scout reads landmarks, research reads libraries, etc.). ' +
    'Every cited entry is re-verified before use; failed verifications are corrected or deleted in the same run. ' +
    'See `.claude/memory/README.md` for the entry shape and self-healing rules.'
  );

  let out = lines.join('\n');
  if (out.length > 2048) out = out.slice(0, 2000) + '\n…(index truncated)';

  const src = sessionSource || 'startup';
  const framing = FRAMINGS[src] || FRAMINGS.startup;

  // #11: snapshot surfaces regardless of age. The 7-day freshness gate was
  // defensive (stale state misleads more than it helps) but cost more than
  // it saved — projects resumed after 8+ days got zero continuity even
  // though the snapshot was on disk. The age framing carries the warning;
  // the user can choose to abandon (via `/triage` to start fresh) or
  // continue (via `/harness` to resume).
  const resumePath = join(memDir, '_resume.md');
  if (existsSync(resumePath)) {
    try {
      const raw = readFileSync(resumePath, 'utf8');
      let body = raw;
      if (raw.startsWith('---')) {
        const first = raw.indexOf('---');
        const second = raw.indexOf('---', first + 3);
        if (second >= 0) body = raw.slice(second + 3).replace(/^\n+/, '');
      }
      const mtime = statSync(resumePath).mtimeMs;
      const ageDays = Math.floor((Date.now() - mtime) / 86400000);
      if (body.trim()) {
        // Detect "abandoned mid-flight workflow": workflow.json on disk
        // (active flag from earlier) AND its completed[] doesn't include
        // "commit". /commit archives workflow.json on success, so its
        // continued presence implies the workflow never closed.
        let midFlightHint = '';
        if (activeWorkflow) {
          try {
            const wf = JSON.parse(readFileSync(workflowJson, 'utf8'));
            const slug = wf.slug || '(unknown)';
            const completed = Array.isArray(wf.completed) ? wf.completed : [];
            if (!completed.includes('commit')) {
              midFlightHint =
                `\n\n**Workflow \`${slug}\` is mid-flight** (last touched ${ageDays}d ago). ` +
                'Run `/harness` to resume, or `/triage "<new request>"` to abandon and start fresh.';
            }
          } catch {}
        }
        const ageWarn = ageDays > 7 ? ' — verify before relying' : '';
        const budget = 9500 - out.length - framing.length - midFlightHint.length - 80;
        if (budget > 500) {
          if (body.length > budget) {
            body = body.slice(0, budget).replace(/\s+$/, '') + '\n\n…(snapshot truncated)';
          }
          out = (
            out +
            '\n\n---\n\n' +
            framing +
            ` (snapshot age: ${ageDays}d${ageWarn})\n\n` +
            body +
            midFlightHint
          );
        }
      }
    } catch {}
  }

  // Inject ONLY the most-recent shelved-thread section (Decision D3 bounding):
  // older sections stay on disk; the read is bounded so the SessionStart
  // envelope holds. Best-effort — absence/parse failure injects nothing.
  try {
    const threadMd = readMostRecentMarkdown({ memDir });
    if (threadMd) {
      const budget = 9000 - out.length - 80;
      if (budget > 300) {
        const block = threadMd.length > budget
          ? threadMd.slice(0, budget).replace(/\s+$/, '') + '\n\n…(thread section truncated)'
          : threadMd;
        out = out + '\n\n---\n\n## Most-recent shelved thread (resume candidate)\n\n' + block;
      }
    }
  } catch {}

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: out,
    },
  });
}
