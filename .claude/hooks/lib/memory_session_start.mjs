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
import { readMostRecentMarkdown, readWorkingThread } from './thread_store.mjs';
import { architectureMapEnabled } from '../../skills/workspace/flags.mjs';
import { readConcepts } from '../../skills/workspace/concepts.mjs';
import { gatherSync } from '../../skills/standup/gather.mjs';
import { parseFrontmatter } from './frontmatter-parser.mjs';

import {
  CANONICAL,
  PENDING_FILE,
  STALE_EXEMPT,
  SUPERSESSION_DRIVEN,
  closureFieldFor,
} from '../../skills/memory-index/categories.mjs';
import { resolveCategory } from '../../skills/memory-index/lift-fields.mjs';
import { decisionsRestingOn } from '../../skills/memory-index/constraints.mjs';

const STALE_COMMITS = 30;
const STALE_DAYS = 30;
const DEFAULT_SIZE_CAP = 500;

// The injection is loaded warm on every session start, so it is charged against
// the context budget before the user types. Every optional tail section below
// checks its remaining room against this.
const SESSION_START_BUDGET = 4096;

// The index table above already reports the stale COUNT per file, and the index
// prompts no action on staleness. The named sample is orientation, not a
// worklist, so three is as useful as five and costs less.
const STALE_SAMPLE = 3;

// thread_store round-trips its own state through a base64 comment in _thread.md.
// The model cannot read it, so the injected copy carries the human-readable
// prose only; the on-disk file keeps the blob.
const THREAD_DATA_COMMENT = /<!--\s*thread-entry[\s\S]*?-->\s*/g;

function stripThreadDataComment(markdown) {
  return markdown.replace(THREAD_DATA_COMMENT, '');
}

const TRUNCATION_NOTICE = '\n\n…(session-start index truncated at the context budget)';

// Room held back from the head sections for the shelved thread, the working
// thread, and the standup. Those answer "what was I doing / what is next" and
// are the reason a resumed session reads this at all; the index table and
// concept map above are orientation. Clamping the composed whole would cut the
// tail — the wrong end — so the head is clamped against this reserve instead.
const TAIL_RESERVE = 1100;

// Room the shelved-thread section leaves for the two sections after it, so a
// long thread cannot consume the working-thread and standup allocations.
const TRAILING_SECTIONS_RESERVE = 700;

// The per-section checks gate only the optional tail; the index table, stale
// sample and concept map are composed unconditionally. Without this the budget
// holds by arithmetic coincidence, and a repository that grows a few more
// concepts silently reopens the leak. Cutting on a line boundary keeps the
// result readable as markdown.
export function clampTo(text, limit) {
  if (text.length <= limit) return text;
  // Below the notice's own length there is no room to say "truncated", and the
  // negative `room` below would slice from the END and return MORE than the
  // limit. Unreachable while SESSION_START_BUDGET is 4096; a future cut would
  // reach it.
  if (limit <= TRUNCATION_NOTICE.length) return limit <= 0 ? '' : text.slice(0, limit);
  const room = limit - TRUNCATION_NOTICE.length;
  const cut = text.lastIndexOf('\n', room);
  return text.slice(0, cut > 0 ? cut : room).replace(/\s+$/, '') + TRUNCATION_NOTICE;
}

function serialize(text) {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
  });
}

// The budget is a property of what the hook WRITES, not of the text it wraps:
// the JSON wrapper adds a fixed prefix and escaping expands every newline to two
// characters. Clamping the inner text to the budget therefore overshoots by a
// few hundred characters. Re-clamp by the measured overage instead of estimating
// it — one pass is enough because shrinking the text never grows the envelope.
function envelopeWithin(text, limit) {
  const envelope = serialize(text);
  if (envelope.length <= limit) return envelope;
  return serialize(clampTo(text, text.length - (envelope.length - limit)));
}

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

// @decision:decay-is-per-category-three-reasons-2026-08-04
export function isStale(block, name, head, root) {
  if (STALE_EXEMPT.has(name)) return false;
  if (getField(block, closureFieldFor(name))) return false;
  // A supersession-driven category expires by being superseded, never by elapsed
  // time — an open decision is still in force no matter how old the commit that
  // verified it. Re-verification pressure comes from Article IX.2 (every skill
  // re-verifies an entry before citing it), not from the decay sweep.
  if (SUPERSESSION_DRIVEN.has(name)) return false;
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

// Presence-based sharded read: when `<memDir>/<name>` is a directory (post
// migration), each `.md` is one fact. Reconstruct a bulleted pseudo-block from
// its frontmatter so the exact `isStale` predicate applies unchanged.
function readShardedCategory(dir, name, head, root) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  let stale = 0;
  const staleRecords = [];
  for (const f of files) {
    let fm;
    try {
      fm = parseFrontmatter(readFileSync(join(dir, f), 'utf8')).frontmatter;
    } catch {
      continue;
    }
    const pseudoBlock = Object.entries(fm)
      .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(',') : v}`)
      .join('\n');
    if (isStale(pseudoBlock, name, head, root)) {
      stale++;
      staleRecords.push([name, fm.key || f.replace(/\.md$/, ''), fm['last-touched'] || '']);
    }
  }
  return { n: files.length, stale, staleRecords };
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

function renderStandupSection(projectRoot) {
  const recap = gatherSync({ rootDir: projectRoot });
  const rel = recap.release || {};
  const version = rel.lastVersion ? `v${rel.lastVersion}` : 'unreleased';
  const unreleased = Array.isArray(rel.commitsSinceTag) ? rel.commitsSinceTag.length : 0;
  const bump = rel.aggregateBump || 'none';
  const pushed = rel.upstream && rel.upstream.state ? rel.upstream.state : 'unknown';
  const lines = [
    '## Standup',
    '',
    `Shipped: \`${version}\`  ·  unreleased commits: ${unreleased} (next bump: ${bump})  ·  upstream: ${pushed}`,
    '',
    'Run `/standup` for the full recap + recommendation.',
  ];
  return lines.join('\n');
}

// Re-exported so a test can prove this reader observes the shared registry rather
// than keeping its own correct-looking copy — the distinction B2 exists to enforce.
export { CANONICAL };

// Every constraint whose `state` reads false, paired with the decisions naming it in
// `rests_on`. Fail-open: a store with no constraints, or an unreadable one, yields []
// and the index renders exactly as before.
function suspectDecisions(memDir) {
  const out = [];
  try {
    const { entries } = resolveCategory(memDir, 'constraints');
    for (const constraint of entries) {
      const holds = String(constraint.fields.state ?? 'true').trim().toLowerCase();
      if (holds !== 'false') continue;
      const dependents = decisionsRestingOn(memDir, constraint.key).map((d) => d.key);
      if (dependents.length) out.push({ constraint: constraint.key, decisions: dependents });
    }
  } catch {
    return [];
  }
  return out;
}

// The architecture map at session start: what the system IS, at the one resolution
// small enough to carry in context. Replaces spending that budget on a stale-count
// table, which says how much memory exists but nothing about the system's shape.
//
// Fail-open and flag-gated: absent flag, absent corpus, or any read error yields ''
// and the index renders exactly as it does today, so a consumer install that never
// opted in sees a byte-identical payload.
// The SessionStart envelope ceiling every appended section is measured against.
const ENVELOPE_MAX = 9500;
const SECTION_SEPARATOR = '\n\n---\n\n';

export function renderConceptMap(specDir, { rootDir = process.cwd() } = {}) {
  let concepts = [];
  try {
    if (!architectureMapEnabled({ rootDir })) return '';
    concepts = readConcepts(specDir);
  } catch {
    return '';
  }
  if (!concepts.length) return '';

  const lines = ['## Architecture map — concepts', ''];
  for (const concept of [...concepts].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`- \`${concept.id}\` — ${concept.title} (${concept.members.length} elements)`);
  }
  lines.push('', 'Ask by concept to descend; ask by touched path to walk up. The map routes; the code witnesses.');
  return lines.join('\n');
}

export function buildIndex({ memDir, projectRoot, sessionSource }) {
  const head = gitHead(projectRoot);

  const rows = [];
  let totalEntries = 0;
  let totalStale = 0;
  const staleRecords = []; // [name, key, lastTouched]
  const overCapRecords = []; // [name, lines, cap]

  for (const name of CANONICAL) {
    const dir = join(memDir, name);
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      const c = readShardedCategory(dir, name, head, projectRoot);
      totalEntries += c.n;
      totalStale += c.stale;
      staleRecords.push(...c.staleRecords);
      rows.push([name, c.n, c.stale, 'sharded']);
      continue;
    }
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

  // AC-004's payoff, and the edge that earns `constraints` a category of its own:
  // when a constraint stops holding, every decision whose rationale rests on it is
  // suspect. `decisionsRestingOn` existed for a while with nothing walking it, so a
  // flipped constraint invalidated nothing anywhere a human would see it.
  const suspect = suspectDecisions(memDir);
  if (suspect.length) {
    lines.push('');
    lines.push('## Decisions resting on a constraint that no longer holds');
    lines.push('');
    for (const { constraint, decisions } of suspect) {
      lines.push(`- \`${constraint}\` flipped — re-examine: ${decisions.map((d) => `\`${d}\``).join(', ')}`);
    }
    lines.push('');
    lines.push('A superseded constraint does not supersede the decisions built on it. Re-check each before citing it.');
  }

  if (staleRecords.length) {
    staleRecords.sort((a, b) => {
      const left = (a[2] || '') + `${a[0]}:${a[1]}`;
      const right = (b[2] || '') + `${b[0]}:${b[1]}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });
    const top = staleRecords.slice(0, STALE_SAMPLE);
    const overflow = staleRecords.length - STALE_SAMPLE;
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

  // The pending count is still reported in the index table above. It no longer
  // produces a prompt: Phase 10.7 flushes inside every workflow, so a session-start
  // nag told the reader about work the pipeline already does.

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

  // The architecture map goes in BEFORE the resume snapshot: it is routing
  // information, and a reader needs to know what the system is made of before
  // deciding where to look. renderConceptMap is already flag-gated and fail-open
  // (it returns '' on an absent flag, an absent corpus, or any read error), so no
  // error handling is added here — the section is simply absent when it is empty.
  //
  // Omitted ENTIRELY rather than truncated when it will not fit: half a concept
  // list routes worse than none, because the missing half reads as "no such
  // concept" rather than "not shown".
  const conceptMap = renderConceptMap(join(projectRoot, 'docs/system'), { rootDir: projectRoot });
  if (conceptMap && out.length + conceptMap.length + SECTION_SEPARATOR.length <= ENVELOPE_MAX) {
    out += SECTION_SEPARATOR + conceptMap;
  }

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
    out = clampTo(out, SESSION_START_BUDGET - TAIL_RESERVE);
    const threadMd = stripThreadDataComment(readMostRecentMarkdown({ memDir }));
    if (threadMd) {
      const budget = SESSION_START_BUDGET - out.length - 80 - TRAILING_SECTIONS_RESERVE;
      if (budget > 300) {
        const block = threadMd.length > budget
          ? threadMd.slice(0, budget).replace(/\s+$/, '') + '\n\n…(thread section truncated)'
          : threadMd;
        out = out + '\n\n---\n\n## Most-recent shelved thread (resume candidate)\n\n' + block;
      }
    }
  } catch {}

  // Surface the durable pinned working thread (Tier 3) — the "what/why" that
  // survives /clear. Short, distinct from the shelved-thread section above.
  try {
    const wt = readWorkingThread({ memDir });
    const whatWhy = wt && Array.isArray(wt.verbatim_cues) ? wt.verbatim_cues.join(' ') : '';
    if (whatWhy && (SESSION_START_BUDGET - out.length) > 200) {
      out = out + '\n\n---\n\n## Working thread (durable what/why)\n\n'
        + `> ${whatWhy.slice(0, 400)}\n\nNext: ${wt.next_step || '(continue)'}`;
    }
  } catch {}

  // Compact release/backlog standup — a section distinct from the resume
  // snapshot above. Best-effort: a gather failure omits the section rather
  // than breaking session start.
  try {
    if ((SESSION_START_BUDGET - out.length) > 250) {
      out = out + '\n\n---\n\n' + renderStandupSection(projectRoot);
    }
  } catch {}

  return envelopeWithin(out, SESSION_START_BUDGET);
}
