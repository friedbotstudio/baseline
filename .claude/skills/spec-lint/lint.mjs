#!/usr/bin/env node
// Covers AC-003 of remove-python-runtime-dep.
// spec-lint — run the diagram-spec checks against a saved spec.
// Usage: lint.mjs <slug>

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function fail(msg) { process.stderr.write(`spec-lint: ${msg}\n`); }

function hasPlantumlCli() {
  const r = spawnSync('plantuml', ['-version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

const FENCE_RE = /^[ \t]*```[ \t]*plantuml[ \t]*$([\s\S]*?)^[ \t]*```[ \t]*$/gim;

function extractBlocks(spec) {
  const blocks = [];
  for (const m of spec.matchAll(FENCE_RE)) blocks.push(m[1]);
  return blocks;
}

function checkSyntax(blocks, hasPuml) {
  if (!hasPuml) return ['SKIP', 'plantuml CLI not on PATH'];
  if (blocks.length === 0) return ['PASS', 'no blocks'];
  const bad = [];
  for (let i = 0; i < blocks.length; i++) {
    let src = blocks[i].replace(/^\n+/, '').replace(/\n+$/, '');
    if (!src.includes('@startuml')) src = `@startuml\n${src}\n@enduml\n`;
    const r = spawnSync('plantuml', ['-checkonly', '-pipe'], {
      input: src, encoding: 'utf8', timeout: 15000,
    });
    if (r.status !== 0) {
      const errText = (r.stderr || r.stdout || '').trim();
      const lines = errText.split('\n').filter(Boolean);
      const last = lines.slice(-2).join(' | ');
      bad.push(`block #${i + 1}: ${last || `exit ${r.status}`}`);
    }
  }
  return bad.length === 0 ? ['PASS', 'all blocks parse'] : ['FAIL', bad.join('; ')];
}

function checkPresence(blocks, pj) {
  let required;
  try {
    required = pj.artifacts.required_diagrams.spec;
  } catch {
    return ['SKIP', 'required_diagrams.spec not configured'];
  }
  const missing = [];
  for (const [kind, rule] of Object.entries(required)) {
    const need = parseInt(rule.min || 1, 10);
    const marker = rule.marker;
    const anyOf = rule.any_of || [];
    let found = 0;
    for (const b of blocks) {
      if (marker && b.includes(marker)) { found += 1; continue; }
      for (const pat of anyOf) {
        try {
          if (new RegExp(pat, 'm').test(b)) { found += 1; break; }
        } catch { /* ignore bad regex */ }
      }
    }
    if (found < need) missing.push(`${kind} (need ${need}, found ${found})`);
  }
  return missing.length === 0 ? ['PASS', 'all kinds present'] : ['FAIL', 'missing: ' + missing.join(', ')];
}

function checkTraceability(spec, blocks) {
  const acSectionRe = /##\s+Acceptance criteria([\s\S]*?)(?=^##\s|$(?![\s\S]))/m;
  const m = spec.match(acSectionRe);
  if (!m) return ['FAIL', "no '## Acceptance criteria' section"];
  const section = m[1];
  const rowRe = /\|\s*(AC-\d+)\s*\|.*?\|\s*(§?Behavior\s*#?\s*\d+|§Behavior\s*#\d+|—|-)\s*\|/gi;
  const rows = [...section.matchAll(rowRe)].map(r => [r[1], r[2]]);
  if (rows.length === 0) return ['FAIL', 'no AC-NNN rows with a sequence reference'];

  const behaviorTitles = new Set();
  for (const b of blocks) {
    const tm = b.match(/^\s*title\s+Behavior\s*#(\d+)\b/im);
    if (tm) behaviorTitles.add(parseInt(tm[1], 10));
  }
  for (const hm of spec.matchAll(/^###\s+Behavior\s*#(\d+)\b/gim)) {
    behaviorTitles.add(parseInt(hm[1], 10));
  }

  const problems = [];
  for (const [acId, ref] of rows) {
    const refTrim = ref.trim();
    if (refTrim === '—' || refTrim === '-') {
      problems.push(`${acId}: no sequence reference`);
      continue;
    }
    const numM = refTrim.match(/#\s*(\d+)/);
    if (!numM) { problems.push(`${acId}: unparsable ref '${refTrim}'`); continue; }
    const n = parseInt(numM[1], 10);
    if (!behaviorTitles.has(n)) problems.push(`${acId}: §Behavior #${n} not found`);
  }
  return problems.length === 0
    ? ['PASS', `${rows.length} AC rows all traced`]
    : ['FAIL', problems.join('; ')];
}

function expandBraceGlobs(globs) {
  const out = [];
  for (const g of globs) {
    if (!g.includes('{')) { out.push(g); continue; }
    const i = g.indexOf('{');
    const j = g.indexOf('}', i);
    const prefix = g.slice(0, i);
    const suffix = g.slice(j + 1);
    const alts = g.slice(i + 1, j).split(',');
    for (const a of alts) out.push(prefix + a.trim() + suffix);
  }
  return out;
}

function globToRegex(g) {
  let i = 0;
  const out = [];
  while (i < g.length) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { out.push('.*'); i += 2; }
      else { out.push('[^/]*'); i += 1; }
    } else if (c === '?') {
      out.push('[^/]'); i += 1;
    } else if ('.+()|^$\\[]{}'.includes(c)) {
      out.push('\\' + c); i += 1;
    } else {
      out.push(c); i += 1;
    }
  }
  return new RegExp('^' + out.join('') + '$');
}

function matchesAnyGlob(path, globs) {
  for (const g of expandBraceGlobs(globs)) {
    if (globToRegex(g).test(path)) return true;
  }
  return false;
}

function checkDesignCalls(spec, pj) {
  let uiGlobs;
  try { uiGlobs = pj?.tdd?.ui_globs || []; } catch { return ['SKIP', 'tdd.ui_globs not configured']; }
  if (!uiGlobs.length) return ['SKIP', 'tdd.ui_globs is empty'];

  const writeSetPaths = new Set();
  for (const line of spec.split('\n')) {
    const m = line.match(/write[_\s]set\s*:\s*(.+)$/i);
    if (m) {
      for (const tok of m[1].split(/[`,\s|]+/)) {
        const t = tok.replace(/\*/g, '').trim();
        if (t && t.includes('/') && !t.startsWith('#')) writeSetPaths.add(t);
      }
    }
  }
  const uiHits = [...writeSetPaths].filter(p => matchesAnyGlob(p, uiGlobs));
  if (uiHits.length === 0) {
    return ['SKIP', `no UI files in write_set (${writeSetPaths.size} paths checked)`];
  }

  const dcMatch = spec.match(/^##\s+Design\s+calls\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/im);
  if (!dcMatch) {
    return ['FAIL', `write_set has UI files (${uiHits.sort().join(', ')}) but no \`## Design calls\` section`];
  }
  const body = dcMatch[1].trim();
  const hasTableRow = /^\|[^|\n]+\|[^|\n]+\|/m.test(body);
  const isNoneMarker = /^\s*-?\s*\*?\(?none\)?\*?\s*$/im.test(body);
  if (!hasTableRow || isNoneMarker) {
    return ['FAIL', `write_set has UI files (${uiHits.sort().join(', ')}) but Design calls section is empty / \`*(none)*\``];
  }
  return ['PASS', `${uiHits.length} UI path(s) match design_calls rows`];
}

function checkCodesignDecisions(spec, root) {
  // Check #4 — codesign mode requires ## Decisions section presence.
  // Fires only when workflow.json -> codesign_mode is true.
  const wfPath = join(root, '.claude', 'state', 'workflow.json');
  if (!existsSync(wfPath)) return ['SKIP', 'no workflow.json'];
  let wf;
  try { wf = JSON.parse(readFileSync(wfPath, 'utf8')); } catch { return ['SKIP', 'workflow.json malformed']; }
  if (wf.codesign_mode !== true) return ['SKIP', 'codesign_mode not active'];

  if (!/^## Decisions\s*$/m.test(spec)) {
    return ['FAIL', 'codesign-decisions-presence: codesign_mode=true but ## Decisions section absent'];
  }
  return ['PASS', '## Decisions section present'];
}

function main(argv) {
  const slug = argv[0];
  if (!slug) {
    process.stderr.write('usage: lint.mjs <slug>\n');
    process.exit(2);
  }
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const specPath = join(root, 'docs', 'specs', `${slug}.md`);
  const projectJsonPath = join(root, '.claude', 'project.json');

  if (!existsSync(specPath)) {
    fail(`spec not found at ${specPath}`);
    process.exit(2);
  }

  const spec = readFileSync(specPath, 'utf8');
  let pj = {};
  try { pj = JSON.parse(readFileSync(projectJsonPath, 'utf8')); } catch { /* ignore */ }
  const hasPuml = hasPlantumlCli();
  const blocks = extractBlocks(spec);

  const results = [
    ['plantuml_syntax', ...checkSyntax(blocks, hasPuml)],
    ['diagram_presence', ...checkPresence(blocks, pj)],
    ['ac_traceability', ...checkTraceability(spec, blocks)],
    ['design_calls', ...checkDesignCalls(spec, pj)],
  ];

  // Check #4 — codesign_decisions — only included in the report when
  // workflow.json -> codesign_mode is true. Suppressed entirely otherwise so
  // the row does not appear in output (parallel to design_calls which only
  // fires when tdd.ui_globs intersects the spec write_set).
  const codesignResult = checkCodesignDecisions(spec, root);
  if (codesignResult[0] !== 'SKIP') {
    results.push(['codesign_decisions', ...codesignResult]);
  }

  const nameW = Math.max(...results.map(r => r[0].length));
  process.stdout.write('check'.padEnd(nameW) + '  ' + 'status'.padEnd(6) + '  detail\n');
  process.stdout.write('-'.repeat(nameW) + '  ' + '-'.repeat(6) + '  ' + '-'.repeat(50) + '\n');
  let overallFail = false;
  for (const [name, status, detail] of results) {
    if (status === 'FAIL') overallFail = true;
    process.stdout.write(`${name.padEnd(nameW)}  ${status.padEnd(6)}  ${detail}\n`);
  }
  process.stdout.write('-'.repeat(nameW) + '  ' + '-'.repeat(6) + '\n');
  process.stdout.write('overall'.padEnd(nameW) + '  ' + (overallFail ? 'FAIL' : 'PASS') + '\n');
  process.exit(overallFail ? 1 : 0);
}

main(process.argv.slice(2));
