#!/usr/bin/env node
// PlantUML Syntax Guard — PreToolUse(Write|Edit|MultiEdit)
//
// Validates every ```plantuml``` fenced block inside writes to docs/specs/*.md.
// The spec template is diagram-driven; a spec with broken PlantUML is useless
// to reviewers and breaks /spec-render. Catching it at the write boundary
// prevents broken diagrams from ever landing on disk.
//
// Guide mode (advisory):
//   - If the pinned plantuml.jar is absent, emit a one-line info message + allow.
//   - If Java is not on PATH, emit a one-line info message + allow.
//   - If a spec has zero plantuml blocks, allow — spec_diagram_presence_guard
//     enforces presence.
//
// Template files (_TEMPLATE_*) are exempt.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join, relative } from 'node:path';
import {
  CLAUDE_PROJECT_ROOT,
  readPayload,
  payloadGet,
  emitAllow,
  emitInfo,
  emitBlock,
  computeProposedContent,
  projectGet,
  logLine,
} from './lib/common.mjs';

// Detect java BEFORE any defensive PATH munging so tests that strip PATH for
// the "java absent" branch see the truth. spawnSync('which', ['java']) is
// cheap and idempotent.
function hasJava() {
  const r = spawnSync('which', ['java'], { encoding: 'utf8' });
  return r.status === 0 && (r.stdout || '').trim() !== '';
}

// Extract ```plantuml ... ``` fenced blocks (case-insensitive language tag).
const fenceRe = /^[ \t]*```[ \t]*plantuml[ \t]*$([\s\S]*?)^[ \t]*```[ \t]*$/gmi;
function plantumlBlocks(content) {
  const blocks = [];
  let m;
  fenceRe.lastIndex = 0;
  while ((m = fenceRe.exec(content)) !== null) blocks.push(m[1]);
  return blocks;
}

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();
const rel = relative(CLAUDE_PROJECT_ROOT, file) || file;

if (!(rel.startsWith('docs/specs/') && rel.endsWith('.md'))) emitAllow();

const base = basename(rel);
if (base.startsWith('_TEMPLATE_') || /TEMPLATE.*\.md$/.test(base)) emitAllow();

const content = computeProposedContent(tool, payload, file);
if (!content.trim()) emitAllow();

// Default behavior: do NOT spawn a JVM at the write boundary. The authoritative
// `java -jar … -checkonly` syntax validation runs on-demand in `/spec-lint`
// (before `/approve-spec`); the LLM does not need it inline. Opt in to
// write-time strict checking via `project.json → plantuml.strict_syntax_check`.
const STRICT = projectGet('plantuml.strict_syntax_check') === true;
if (!STRICT) {
  const n = plantumlBlocks(content).length;
  if (n > 0) {
    emitInfo(`PlantUML syntax is not validated at the write boundary (project.json → plantuml.strict_syntax_check is off) — ${n} fence(s) in '${rel}'. Run \`/spec-lint <slug>\` to validate before \`/approve-spec\`, or set plantuml.strict_syntax_check: true to check at write time.`);
    logLine('plantuml_syntax_guard', `ADVISORY (strict off) ${rel} fences=${n}`);
  }
  emitAllow();
}

// Strict mode (opt-in): validate each fence via `java -jar plantuml.jar -checkonly`.
const HAS_JAVA = hasJava();
const projectDir = process.env.CLAUDE_PROJECT_DIR || CLAUDE_PROJECT_ROOT;
const plantumlJar = join(projectDir, '.claude', 'bin', 'plantuml.jar');

if (!existsSync(plantumlJar)) {
  emitInfo(`PlantUML validation in guide mode — \`java -jar .claude/bin/plantuml.jar\` is required for strict syntax check. The jar is absent at ${plantumlJar} (re-run \`npx @friedbotstudio/create-baseline install\` to fetch). Skipping syntax check for '${rel}'.`);
  logLine('plantuml_syntax_guard', `GUIDE (no plantuml.jar) ${rel}`);
  emitAllow();
}

if (!HAS_JAVA) {
  emitInfo(`PlantUML validation in guide mode — Java is missing from PATH. Install JDK 8+ (e.g. \`brew install openjdk\` on macOS, \`apt install default-jre\` on Debian/Ubuntu) to enable strict validation. Skipping syntax check for '${rel}'.`);
  logLine('plantuml_syntax_guard', `GUIDE (no java) ${rel}`);
  emitAllow();
}

const blocks = plantumlBlocks(content);
if (blocks.length === 0) emitAllow();

const failures = [];
for (let idx = 0; idx < blocks.length; idx++) {
  let src = blocks[idx].replace(/^\n+|\n+$/g, '');
  if (!src.includes('@startuml')) src = `@startuml\n${src}\n@enduml\n`;
  const firstLine = (src.split(/\r?\n/).find((ln) => ln.trim() && !ln.trim().startsWith('@start')) || '').trim().slice(0, 80);
  const r = spawnSync('java', ['-jar', plantumlJar, '-checkonly', '-pipe'], {
    input: src,
    encoding: 'utf8',
    timeout: 15000,
  });
  if (r.error && r.error.code === 'ENOENT') {
    // Race: java vanished between the up-front check and now. Guide mode.
    emitAllow();
  }
  if (r.error && r.error.code === 'ETIMEDOUT') {
    failures.push({ idx: idx + 1, firstLine, detail: 'plantuml -checkonly timed out after 15s' });
    continue;
  }
  if (r.status !== 0) {
    const errText = ((r.stderr || '') || (r.stdout || '')).trim();
    const lines = errText.split(/\r?\n/).filter(Boolean);
    const detail = lines.length ? lines.slice(-3).join(' | ') : `exit=${r.status}`;
    failures.push({ idx: idx + 1, firstLine, detail });
  }
}

if (failures.length === 0) emitAllow();

const out = [`PlantUML Syntax Guard: '${rel}' has invalid PlantUML in ${failures.length} block(s). Fix and re-run.`];
for (const { idx, firstLine, detail } of failures) {
  const label = firstLine ? `"${firstLine}"` : '(empty first line)';
  out.push(`  - block #${idx} ${label}: ${detail}`);
}
out.push('Tip: render interactively via the plantuml MCP server, or run `/spec-lint <slug>` to iterate before saving.');
emitBlock(out.join('\n'));
