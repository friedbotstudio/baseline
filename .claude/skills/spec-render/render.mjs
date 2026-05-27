#!/usr/bin/env node
// Covers AC-003 of remove-python-runtime-dep.
// spec-render — extract every ```plantuml``` block from docs/specs/<slug>.md,
// classify it, render to SVG, and write an index.md.
//
// Usage: render.mjs <slug>

import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function fail(msg) { process.stderr.write(`spec-render: ${msg}\n`); }

const FENCE_RE = /^[ \t]*```[ \t]*plantuml[ \t]*$([\s\S]*?)^[ \t]*```[ \t]*$/gim;
const HEADING_RE = /^\s{0,3}#{2,4}\s+(.+?)\s*$/gm;

function classify(body) {
  const lowered = body.toLowerCase();
  if (lowered.includes('!include <c4/c4_context>')) return 'c4_context';
  if (lowered.includes('!include <c4/c4_container>')) return 'c4_container';
  if (lowered.includes('!include <c4/c4_component>')) return 'c4_component';
  if (/'\s*@kind\s+dependency-graph/.test(body)) return 'dependency_graph';
  if (/^\s*(participant|actor)\b/m.test(body)) return 'sequence';
  if (/^\s*\[\*\]\s*-->/m.test(body)) return 'state';
  if (/^\s*class\s+\w/m.test(body)) return 'class';
  return 'other';
}

function findLastHeadingBefore(spec, position) {
  HEADING_RE.lastIndex = 0;
  let last = '(untitled)';
  for (const m of spec.matchAll(HEADING_RE)) {
    if (m.index >= position) break;
    last = m[1].trim();
  }
  return last;
}

function extractBlocks(spec) {
  const blocks = [];
  for (const m of spec.matchAll(FENCE_RE)) {
    const section = findLastHeadingBefore(spec, m.index);
    let body = m[1].replace(/^\n+/, '').replace(/\n+$/, '');
    if (!body.includes('@startuml')) {
      body = `@startuml\n${body}\n@enduml\n`;
    }
    blocks.push({ section, kind: classify(body), body });
  }
  return blocks;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function writePumlFiles(blocks, outDir, slug) {
  const indexLines = [`# Rendered diagrams — ${slug}`, ''];
  for (let i = 0; i < blocks.length; i++) {
    const { section, kind, body } = blocks[i];
    const idx = i + 1;
    const stem = `${pad2(idx)}_${kind}`;
    const pumlPath = join(outDir, `${stem}.puml`);
    writeFileSync(pumlPath, body.endsWith('\n') ? body : body + '\n', 'utf8');
    indexLines.push(`## ${pad2(idx)}. ${section} — \`${kind}\``);
    indexLines.push('');
    indexLines.push(`![${kind}](${stem}.svg)`);
    indexLines.push('');
    indexLines.push(`Source: [\`${stem}.puml\`](${stem}.puml)`);
    indexLines.push('');
  }
  writeFileSync(join(outDir, 'index.md'), indexLines.join('\n'), 'utf8');
}

function renderToSvg(plantumlJar, pumlPath, outDir) {
  const r = spawnSync('java', ['-jar', plantumlJar, '-tsvg', '-o', outDir, pumlPath], {
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr || '' };
}

function summarizeKinds(outDir) {
  const counts = new Map();
  for (const entry of readdirSync(outDir)) {
    if (!entry.endsWith('.svg')) continue;
    const stem = entry.slice(0, -'.svg'.length).replace(/^\d+_/, '');
    counts.set(stem, (counts.get(stem) || 0) + 1);
  }
  for (const [kind, count] of counts) {
    process.stdout.write(`  ${kind}: ${count}\n`);
  }
}

function main(argv) {
  const slug = argv[0];
  if (!slug) {
    process.stderr.write('usage: render.mjs <slug>\n');
    process.exit(2);
  }
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const specPath = join(root, 'docs', 'specs', `${slug}.md`);
  const outDir = join(root, 'docs', 'specs', '_rendered', slug);
  const plantumlJar = join(root, '.claude', 'bin', 'plantuml.jar');

  if (!existsSync(specPath)) {
    fail(`spec not found at ${specPath}`);
    process.exit(2);
  }
  if (!existsSync(plantumlJar)) {
    fail(`plantuml.jar not found at ${plantumlJar}. Re-run \`npx @friedbotstudio/create-baseline install\` to fetch it.`);
    process.exit(2);
  }
  const javaCheck = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (javaCheck.error || javaCheck.status !== 0) {
    fail(`java not on PATH. Install JDK 8+ (e.g. \`brew install openjdk\` on macOS, \`apt install default-jre\` on Debian/Ubuntu) and re-run.`);
    process.exit(2);
  }

  mkdirSync(outDir, { recursive: true });
  for (const entry of readdirSync(outDir)) {
    if (entry.endsWith('.puml') || entry.endsWith('.svg') || entry === 'index.md') {
      rmSync(join(outDir, entry), { force: true });
    }
  }

  const spec = readFileSync(specPath, 'utf8');
  const blocks = extractBlocks(spec);

  if (blocks.length === 0) {
    fail('no ```plantuml``` blocks found');
    process.exit(1);
  }

  writePumlFiles(blocks, outDir, slug);
  process.stdout.write(`spec-render: extracted ${blocks.length} block(s)\n`);

  let fails = 0;
  for (const entry of readdirSync(outDir)) {
    if (!entry.endsWith('.puml')) continue;
    const pumlPath = join(outDir, entry);
    const r = renderToSvg(plantumlJar, pumlPath, outDir);
    if (r.status !== 0) {
      process.stderr.write(`spec-render: FAILED to render ${entry}\n`);
      const head = r.stderr.split('\n').slice(0, 10).join('\n');
      if (head) process.stderr.write(head + '\n');
      fails += 1;
    }
  }

  if (fails > 0) {
    fail('one or more blocks failed to render. See errors above.');
    process.exit(1);
  }

  process.stdout.write(`spec-render: wrote ${join(outDir, 'index.md')}\n`);
  summarizeKinds(outDir);
}

main(process.argv.slice(2));
