// Continuity snapshot writer.
//
// Ported from the legacy resume_writer.py. Walks a Claude Code transcript
// JSONL plus state files and writes a single-snapshot
// `.claude/memory/_resume.md`. Shared by:
//
//   - memory_pre_compact.mjs (PreCompact event — capture before compaction)
//   - memory_stop.mjs        (Stop event      — refresh every turn-end)
//
// The snapshot answers "where were we / what's next?" so a session that
// gets compacted, /clear'd, or resumed in a new shell can pick up.
//
// Exports `writeSnapshot({ transcript, projectDir, trigger })` and
// `composeSnapshot(...)` (composition only, for tests / preview).

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

const MAX_USER_PROMPTS = 3;
const MAX_FILES = 12;
const MAX_SKILLS = 5;
const MAX_BASH = 5;
const USER_PROMPT_CHARS = 400;

function utcNowIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

function* iterTranscriptEvents(transcript) {
  let raw;
  try { raw = readFileSync(transcript, 'utf8'); }
  catch { return; }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { yield JSON.parse(trimmed); }
    catch { continue; }
  }
}

function extractTextBlocks(content) {
  const out = [];
  if (typeof content === 'string') {
    if (content.trim()) out.push(content.trim());
    return out;
  }
  if (!Array.isArray(content)) return out;
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type !== 'text') continue;
    const t = block.text;
    if (typeof t === 'string' && t.trim()) out.push(t.trim());
  }
  return out;
}

function walk(transcript) {
  const userPrompts = [];
  const fileWrites = []; // [path, tool]
  const skillCalls = [];
  const bashCmds = [];
  let lastAssistantText = '';

  for (const ev of iterTranscriptEvents(transcript)) {
    let msg = (ev && typeof ev === 'object' && ev.message) ? ev.message : null;
    if (!msg || typeof msg !== 'object') msg = (ev && typeof ev === 'object') ? ev : {};
    const role = msg.role || (ev && typeof ev === 'object' ? ev.role : null);
    const content = msg.content;

    if (role === 'user') {
      for (const t of extractTextBlocks(content)) {
        if (t.startsWith('<system-reminder>') || t.slice(0, 64).includes('<command-name>')) continue;
        if (t.startsWith('<local-command-')) continue;
        userPrompts.push(t);
      }
    } else if (role === 'assistant') {
      const textBlocks = extractTextBlocks(content);
      if (textBlocks.length) lastAssistantText = textBlocks[textBlocks.length - 1];
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== 'object') continue;
          if (block.type !== 'tool_use') continue;
          const name = block.name || '';
          const inp = (block.input && typeof block.input === 'object') ? block.input : {};
          if (name === 'Edit' || name === 'Write' || name === 'MultiEdit') {
            const fp = inp.file_path || '';
            if (fp) fileWrites.push([fp, name]);
          } else if (name === 'Skill') {
            const sk = inp.skill || '';
            if (sk) skillCalls.push(sk);
          } else if (name === 'Bash') {
            const cmd = inp.command || '';
            if (cmd) bashCmds.push(cmd.trim().split(/\r?\n/)[0].slice(0, 160));
          }
        }
      }
    }
  }

  return { userPrompts, fileWrites, skillCalls, bashCmds, lastAssistantText };
}

function readWorkflow(projectDir) {
  const p = join(projectDir, '.claude', 'state', 'workflow.json');
  const data = readJson(p);
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

function lastHarnessLogLine(projectDir, slug) {
  const logPath = join(projectDir, '.claude', 'state', 'harness', `${slug}.log`);
  if (!existsSync(logPath)) return '';
  try {
    const text = readFileSync(logPath, 'utf8');
    const lines = text.split(/\r?\n/).filter((ln) => ln.trim());
    return lines.length ? lines[lines.length - 1] : '';
  } catch { return ''; }
}

function relPath(path, projectDir) {
  try {
    if (isAbsolute(path)) return relative(projectDir, path);
  } catch {}
  return path;
}

function dedupKeepOrder(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (seen.has(it)) continue;
    seen.add(it);
    out.push(it);
  }
  return out;
}

const TRACK_ID_TO_ENTRY_PHASE = {
  'intake-full': 'intake',
  'spec-entry': 'spec',
  'tdd-quickfix': 'tdd',
  'chore': 'chore',
};

export function composeSnapshot({ transcript, projectDir, trigger }) {
  const w = walk(transcript);
  const workflow = readWorkflow(projectDir);

  const slug = workflow.slug || '(none)';
  const entryPhase = workflow.entry_phase || TRACK_ID_TO_ENTRY_PHASE[workflow.track_id] || '(unknown)';
  const completed = Array.isArray(workflow.completed) ? workflow.completed : [];
  const exceptions = Array.isArray(workflow.exceptions) ? workflow.exceptions : [];
  const phases = Array.isArray(workflow.phases) ? workflow.phases : [];

  // Next phase = first phase not in completed, after entry_phase.
  let nextPhase = '(unknown)';
  if (phases.length) {
    let start = phases.indexOf(entryPhase);
    if (start < 0) start = 0;
    let found = false;
    for (let i = start; i < phases.length; i++) {
      const ph = phases[i];
      if (exceptions.includes(ph)) continue;
      if (!completed.includes(ph)) { nextPhase = ph; found = true; break; }
    }
    if (!found) nextPhase = '(workflow complete)';
  }

  const lastCompleted = completed.length ? completed[completed.length - 1] : '(none)';

  // File writes — most recent unique paths, project-relative.
  const filesRecent = [];
  for (let i = w.fileWrites.length - 1; i >= 0; i--) {
    const [fp] = w.fileWrites[i];
    const rel = relPath(fp, projectDir);
    if (rel.startsWith('.claude/state/') || rel.startsWith('.claude/memory/_pending')) continue;
    if (!filesRecent.includes(rel)) filesRecent.push(rel);
    if (filesRecent.length >= MAX_FILES) break;
  }

  // User prompts — last K, most-recent first.
  const promptsRecent = w.userPrompts.slice(-MAX_USER_PROMPTS).reverse();

  // Skill calls — last K, dedup keep-order, most-recent first.
  const skillsRecent = dedupKeepOrder(w.skillCalls.slice(-MAX_SKILLS * 3))
    .reverse()
    .slice(0, MAX_SKILLS);

  // Bash — last K (chatty, so keep small).
  const bashRecent = w.bashCmds.slice(-MAX_BASH).reverse();

  const lastLog = slug !== '(none)' ? lastHarnessLogLine(projectDir, slug) : '';

  let hint;
  if (slug === '(none)') {
    hint = 'No active workflow. Run `/triage "<request>"` to start one, or `/harness` if you have a concrete request.';
  } else if (nextPhase === '(workflow complete)') {
    hint = `Workflow \`${slug}\` is complete. Run \`/grant-commit\` then \`/harness\` to commit.`;
  } else {
    hint = `Run \`/harness\` to resume \`${slug}\` at phase \`${nextPhase}\`.`;
  }

  const lines = [];
  lines.push('---');
  lines.push('name: resume');
  lines.push('type: continuity');
  lines.push(`last-updated: ${utcNowIso()}`);
  lines.push(`trigger: ${trigger}`);
  lines.push('---');
  lines.push('');
  lines.push('# Resume snapshot');
  lines.push('');
  lines.push('## Active workflow');
  lines.push(`- Slug: \`${slug}\``);
  lines.push(`- Entry phase: \`${entryPhase}\``);
  lines.push(`- Last completed phase: \`${lastCompleted}\``);
  lines.push(`- Next phase due: \`${nextPhase}\``);
  if (exceptions.length) {
    lines.push(`- Exceptions: ${exceptions.map((e) => `\`${e}\``).join(', ')}`);
  }
  if (lastLog) lines.push(`- Last harness log: \`${lastLog}\``);
  lines.push('');

  lines.push('## In-flight files (most recent writes this session)');
  if (filesRecent.length) {
    for (const fp of filesRecent) lines.push(`- \`${fp}\``);
  } else {
    lines.push('- (none captured)');
  }
  lines.push('');

  lines.push('## Recent skill invocations');
  if (skillsRecent.length) {
    for (const sk of skillsRecent) lines.push(`- \`/${sk}\``);
  } else {
    lines.push('- (none captured)');
  }
  lines.push('');

  if (bashRecent.length) {
    lines.push('## Recent shell commands');
    for (const cmd of bashRecent) lines.push(`- \`${cmd}\``);
    lines.push('');
  }

  lines.push('## Recent user requests (most recent first)');
  if (promptsRecent.length) {
    for (let p of promptsRecent) {
      let text = p.replace(/\r/g, ' ');
      if (text.length > USER_PROMPT_CHARS) text = text.slice(0, USER_PROMPT_CHARS).replace(/\s+$/, '') + '…';
      const block = text.split(/\r?\n/).map((ln) => `> ${ln}`).join('\n');
      lines.push(block);
      lines.push('');
    }
  } else {
    lines.push('- (none captured)');
    lines.push('');
  }

  lines.push('## Continue with');
  lines.push(hint);
  lines.push('');

  return lines.join('\n');
}

export function writeSnapshot({ transcript, projectDir, trigger }) {
  const memDir = join(projectDir, '.claude', 'memory');
  try {
    if (!statSync(memDir).isDirectory()) return null;
  } catch { return null; }
  const body = composeSnapshot({ transcript, projectDir, trigger });
  const out = join(memDir, '_resume.md');
  try {
    writeFileSync(out, body, 'utf8');
    return out;
  } catch { return null; }
}
