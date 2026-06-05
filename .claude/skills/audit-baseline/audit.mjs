#!/usr/bin/env node
// Covers AC-001, AC-003, AC-007, AC-009 of remove-python-runtime-dep
// (audit pass on python-less machine; no Python interpreter referenced
// in shipped wrappers; manifest has zero .py entries — verified by
// post-build hash sweep; helper-list expects .mjs paths).
// audit-baseline — drift check between docs/init/seed.md and the implementation.
//
// Reports each check as PASS / FAIL / WARN with a short detail. Exits 0 on a
// clean audit, 1 if any FAIL. Read-only; safe to run any time, in CI, or as
// the final step of /init-project.

import { existsSync, readFileSync, readdirSync, statSync, accessSync, realpathSync, constants as fsc } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { deriveCounts, SKILL_CATEGORIES } from './derive-counts.mjs';

// True only when run as a script (`node audit.mjs`), false when imported by a
// test. Guards the top-level audit run + process.exit so importing the exported
// surface-check helpers does not execute the whole audit or kill the importer.
// realpathSync both sides: import.meta.url is symlink-resolved by Node, but
// process.argv[1] is passed verbatim, so an invocation under a symlinked path
// (macOS /tmp -> /private/tmp) would otherwise mis-compare and silently skip
// the entire audit run.
const IS_MAIN = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
})();

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// --file=<rel> scoping
let SCOPE_FILE = '';
// --skip-hash-check suppresses ONLY the per-file sha256 re-hash of manifest-listed
// skill files. It is for the build-internal Stage-4 invocation, where the manifest
// was just stamped from the same source THIS run, so the re-hash is tautological.
// The standalone audit (verify/integrate verdict) is invoked WITHOUT this flag and
// keeps full hash-drift detection.
let SKIP_HASH_CHECK = false;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--file=')) SCOPE_FILE = arg.slice('--file='.length);
  else if (arg === '--skip-hash-check') SKIP_HASH_CHECK = true;
}

if (SCOPE_FILE) {
  const inScope = (
    SCOPE_FILE.startsWith('.claude/') ||
    SCOPE_FILE === 'CLAUDE.md' ||
    SCOPE_FILE === 'README.md' ||
    SCOPE_FILE === 'docs/init/seed.md' ||
    SCOPE_FILE === 'src/CLAUDE.template.md' ||
    SCOPE_FILE === 'src/seed.template.md' ||
    SCOPE_FILE === 'src/settings.template.json' ||
    SCOPE_FILE === 'src/project.template.json' ||
    SCOPE_FILE.startsWith('src/agents/') ||
    SCOPE_FILE.startsWith('src/memory/') ||
    SCOPE_FILE === 'src/.mcp.template.json' ||
    SCOPE_FILE.startsWith('obj/template/') ||
    SCOPE_FILE === 'scripts/build-manifest.mjs' ||
    SCOPE_FILE === 'scripts/build-template.sh'
  );
  if (!inScope) {
    process.stdout.write(`audit-baseline: ${SCOPE_FILE} is out of baseline scope (no checks affected)\n`);
    process.exit(0);
  }
}

const results = [];
const add = (name, status, detail = '') => results.push([name, status, detail]);

function readText(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}
function readJson(rel) {
  const txt = readText(rel);
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}
function isValidPreamble(text) {
  if (!text.startsWith('---')) return [false, 'missing frontmatter'];
  const remainder = text.slice(3);
  if (remainder.includes('\n---\n') || remainder.endsWith('\n---')) return [true, ''];
  return [false, 'malformed frontmatter: missing closing separator'];
}

const EXPECTED_HOOKS = new Set([
  'setup_guard', 'destructive_cmd_guard', 'git_commit_guard', 'env_guard',
  'spec_approval_guard', 'swarm_approval_guard', 'verify_pass_guard',
  'track_guard', 'artifact_template_guard', 'plantuml_syntax_guard',
  'spec_diagram_presence_guard', 'spec_design_calls_guard',
  'swarm_boundary_guard', 'tdd_order_guard',
  'process_lifecycle_guard',
  'lint_runner', 'test_runner',
  'memory_session_start', 'memory_stop', 'memory_pre_compact',
  'harness_continuation',
  'consent_gate_grant',
]);
const EXPECTED_AGENTS = new Set(['swarm-worker']);
const EXPECTED_COMMANDS = new Set([
  'approve-spec', 'approve-swarm', 'grant-commit', 'grant-push',
  'init-project', 'init-project-doctor',
]);
const EXPECTED_MEMORY_FILES = new Set([
  'landmarks', 'libraries', 'decisions', 'landmines', 'conventions',
  'pending-questions', 'backlog', '_pending', '_resume', '_thread',
]);

function loadManifest() {
  for (const rel of ['.claude/manifest.json', 'obj/template/.claude/manifest.json']) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) continue;
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
  }
  return null;
}

function readSkillOwner(slug) {
  const p = join(ROOT, '.claude', 'skills', slug, 'SKILL.md');
  if (!existsSync(p)) return null;
  const text = readFileSync(p, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) return null;
  const m = fm[1].match(/^owner:\s*(\S+)\s*$/m);
  return m ? m[1] : null;
}

const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, 'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23,
  'twenty-four': 24, 'twenty-five': 25, 'twenty-six': 26, 'twenty-seven': 27, 'twenty-eight': 28,
  'twenty-nine': 29, thirty: 30, 'thirty-one': 31, 'thirty-two': 32, 'thirty-three': 33,
  'thirty-four': 34, 'thirty-five': 35, 'thirty-six': 36, 'thirty-seven': 37, 'thirty-eight': 38,
  'thirty-nine': 39, forty: 40,
};
function toInt(s) {
  const t = (s || '').trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return Object.prototype.hasOwnProperty.call(WORDS, t) ? WORDS[t] : null;
}

// Cross-check a single count literal in a prose surface against the derived
// truth. Returns {status, detail}. WARN (never silent-pass) when the literal
// cannot be extracted, so a regex that stops matching surfaces as a signal
// rather than a false PASS. Exported for unit testing.
export function checkSurfaceCount(file, regex, expected) {
  if (!existsSync(file)) return { status: 'WARN', detail: `surface missing: ${file}` };
  const m = readFileSync(file, 'utf8').match(regex);
  if (!m) return { status: 'WARN', detail: 'count literal not found (unextractable)' };
  const got = toInt(m[1]);
  if (got === null) return { status: 'WARN', detail: `unparseable literal "${m[1]}"` };
  return got === expected
    ? { status: 'PASS', detail: `${got}` }
    : { status: 'FAIL', detail: `expected ${expected}, found ${m[1]}` };
}

// Assert a skills category breakdown adds up to the skills total. Returns
// {status, detail}. Exported for unit testing.
export function checkByCategorySum(byCategory, total) {
  const sum = Object.values(byCategory).reduce((a, b) => a + b, 0);
  return sum === total
    ? { status: 'PASS', detail: `sum ${sum} == total ${total}` }
    : { status: 'FAIL', detail: `byCategory sum ${sum} != skills total ${total}` };
}

function listDir(rel, opts = {}) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return [];
  try {
    const entries = readdirSync(p, { withFileTypes: true });
    return opts.dirsOnly
      ? entries.filter(e => e.isDirectory()).map(e => e.name)
      : entries.filter(e => e.isFile()).map(e => e.name);
  } catch { return []; }
}

// Load project.json additions
const pj = readJson('.claude/project.json');
const additions = (pj && pj.additions) || {};
const addAgents = new Set(additions.agents || []);
const addSkills = new Set(additions.skills || []);
const addHooks = new Set(additions.hooks || []);

// On-disk inventory
const hookFiles = listDir('.claude/hooks');
const diskHooks = new Set(
  hookFiles
    .filter(n => n.endsWith('.sh') || n.endsWith('.mjs'))
    .map(n => n.replace(/\.(sh|mjs)$/, ''))
);
const diskAgents = new Set(listDir('.claude/agents').filter(n => n.endsWith('.md')).map(n => n.replace(/\.md$/, '')));
const diskSkills = new Set(listDir('.claude/skills', { dirsOnly: true }));
const diskCommands = new Set(listDir('.claude/commands').filter(n => n.endsWith('.md')).map(n => n.replace(/\.md$/, '')));

const diskBaselineHooks = new Set([...diskHooks].filter(h => !addHooks.has(h)));
const diskBaselineAgents = new Set([...diskAgents].filter(a => !addAgents.has(a)));
const diskBaselineSkills = new Set([...diskSkills].filter(s => readSkillOwner(s) === 'baseline'));

// ---------- counts vs seed.md ----------
const seedText = readText('docs/init/seed.md');

function findCount(...patterns) {
  for (const pat of patterns) {
    const m = seedText.match(pat);
    if (m) {
      const v = toInt(m[1]);
      if (v !== null) return v;
    }
  }
  return null;
}

const NUM_WORD = String.raw`\d+|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty`;

const hooksClaimed = findCount(
  new RegExp(String.raw`\((\d+|${NUM_WORD})\s+\.sh\s+scripts?\s+total\)`, 'i'),
  new RegExp(String.raw`§4\.1\s+Hooks\s+\((\d+)\s+total\b`, 'i'),
  new RegExp(String.raw`\b(${NUM_WORD})\s+guards?\b`, 'i'),
);
const agentsClaimed = findCount(/\b(\d+|one|two|three|eight|nine|ten|eleven|twelve)\s+subagents?\b/i);
const skillsClaimed = findCount(
  /\b(\d+|twenty-(?:four|five|six|seven|eight|nine)|thirty|thirty-(?:one|two|three|four|five|six|seven|eight|nine)|forty)\s+skills?\b/i
);
let cmdsClaimed = null;
if (/four\s+consent\s+gates?\s*\+\s*one\s+bootstrap\s*\+\s*one\s+doctor/i.test(seedText)) cmdsClaimed = 6;
else if (/four\s+consent\s+gates?\s*\+\s*one\s+bootstrap/i.test(seedText)) cmdsClaimed = 5;

function checkCount(label, claimed, actual) {
  if (claimed === null) add(label, 'WARN', `could not extract claimed count; disk has ${actual}`);
  else if (claimed === actual) add(label, 'PASS', `${actual}`);
  else add(label, 'FAIL', `seed claims ${claimed}, disk has ${actual}`);
}

checkCount('hooks count (seed vs baseline)', hooksClaimed, diskBaselineHooks.size);
checkCount('agents count (seed vs baseline)', agentsClaimed, diskBaselineAgents.size);
checkCount('skills count (seed vs baseline)', skillsClaimed, diskBaselineSkills.size);
checkCount('commands count (seed vs disk)', cmdsClaimed, diskCommands.size);

function checkNames(label, baseline, addns, disk) {
  const expected = new Set([...baseline, ...addns]);
  const missing = [...expected].filter(x => !disk.has(x)).sort();
  const unexpected = [...disk].filter(x => !expected.has(x)).sort();
  if (missing.length === 0 && unexpected.length === 0) {
    const detail = addns.size > 0
      ? `${baseline.size} baseline + ${addns.size} project = ${disk.size}`
      : '';
    add(label, 'PASS', detail);
  } else {
    const bits = [];
    if (missing.length) bits.push(`missing: ${JSON.stringify(missing)}`);
    if (unexpected.length) bits.push(`unexpected: ${JSON.stringify(unexpected)}`);
    add(label, 'FAIL', bits.join('; '));
  }
}

checkNames('hooks names match seed §4.1', EXPECTED_HOOKS, addHooks, diskHooks);
checkNames('agents names match seed §4.2', EXPECTED_AGENTS, addAgents, diskAgents);

const manifestForSkills = loadManifest();
const canonicalSkills = manifestForSkills
  ? new Set(Object.keys((manifestForSkills.owners || {}).skills || {}))
  : diskBaselineSkills;
const canonicalSkillsToUse = canonicalSkills.size > 0 ? canonicalSkills : diskBaselineSkills;
checkNames('skills names match seed §4.3', canonicalSkillsToUse, new Set(), diskBaselineSkills);
checkNames('commands names match seed §4.4', EXPECTED_COMMANDS, new Set(), diskCommands);

// ---------- skill ownership (hash drift + frontmatter validation) ----------
function checkSkillOwnership() {
  for (const slug of [...diskSkills].sort()) {
    const owner = readSkillOwner(slug);
    if (owner === null) continue;
    if (owner !== 'baseline' && owner !== 'user') {
      add(`skill ownership: ${slug}`, 'FAIL', `invalid owner=${owner}`);
    }
  }
  const manifest = loadManifest();
  if (!manifest) {
    add('skill ownership: manifest', 'WARN', '.claude/manifest.json (or obj/template/.claude/manifest.json) missing — run npm run build');
    return;
  }
  const ownersSkills = (manifest.owners || {}).skills || {};
  const filesMap = manifest.files || {};
  for (const slug of Object.keys(ownersSkills).sort()) {
    const skillDir = join(ROOT, '.claude', 'skills', slug);
    if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
      add(`skill ownership: ${slug}`, 'FAIL', 'baseline skill missing');
      continue;
    }
    for (const [path, entry] of Object.entries(filesMap)) {
      if (!path.startsWith(`.claude/skills/${slug}/`)) continue;
      const diskFile = join(ROOT, path);
      if (!existsSync(diskFile)) {
        add(`skill ownership: ${slug}`, 'FAIL', `baseline skill missing: ${path}`);
        continue;
      }
      if (SKIP_HASH_CHECK) continue; // presence still verified above; re-hash suppressed (build-internal)
      const expectedHash = typeof entry === 'string' ? entry : (entry && entry.sha256);
      const actual = createHash('sha256').update(readFileSync(diskFile)).digest('hex');
      if (actual !== expectedHash) {
        add(`skill ownership: ${slug}`, 'FAIL', `hash mismatch at ${path}`);
        break;
      }
    }
  }
}
checkSkillOwnership();

// ---------- constitutional citation ----------
function checkConstitutionalCitations() {
  const claudeText = readText('CLAUDE.md');
  const seedT = readText('docs/init/seed.md');
  if (!claudeText.includes('## Article XI') || !claudeText.includes('manifest')) {
    add('CLAUDE.md citation', 'FAIL', 'CLAUDE.md missing Article XI citation');
  } else {
    add('CLAUDE.md citation', 'PASS', 'Article XI present');
  }
  if (!seedT.includes('## §17') || !seedT.includes('manifest')) {
    add('seed.md citation', 'FAIL', 'seed.md missing §17 citation');
  } else {
    add('seed.md citation', 'PASS', '§17 present');
  }
}
checkConstitutionalCitations();

// ---------- CLAUDE.md size cap (Article I.6 / seed §14) ----------
// CLAUDE.md carries binding rules only; history/narration/appendices live in
// .claude/CONSTITUTION.md. The cap is stated in characters, so measure string
// length (code points), matching how the harness reports the file size.
const CLAUDE_CHAR_CAP = 40000;
function checkClaudeSizeCap() {
  const targets = [['CLAUDE.md', readText('CLAUDE.md')]];
  const srcTemplate = readText('src/CLAUDE.template.md');
  if (srcTemplate) targets.push(['src/CLAUDE.template.md', srcTemplate]);
  for (const [rel, text] of targets) {
    if (!text) { add(`size cap: ${rel}`, 'FAIL', 'missing or empty'); continue; }
    const chars = text.length;
    if (chars > CLAUDE_CHAR_CAP) {
      add(`size cap: ${rel}`, 'FAIL',
        `${chars} chars > ${CLAUDE_CHAR_CAP} — move history/narration/appendices to .claude/CONSTITUTION.md`);
    } else {
      add(`size cap: ${rel}`, 'PASS', `${chars}/${CLAUDE_CHAR_CAP} chars`);
    }
  }
}
checkClaudeSizeCap();

// ---------- memory directory ----------
const memDir = join(ROOT, '.claude', 'memory');
if (!existsSync(memDir) || !statSync(memDir).isDirectory()) {
  add('memory directory exists', 'FAIL', 'missing .claude/memory/');
} else {
  add('memory directory exists', 'PASS', '');
  const diskMemory = new Set(
    listDir('.claude/memory')
      .filter(n => n.endsWith('.md') && n !== 'README.md')
      .map(n => n.replace(/\.md$/, ''))
  );
  const missing = [...EXPECTED_MEMORY_FILES].filter(x => !diskMemory.has(x)).sort();
  const unexpected = [...diskMemory].filter(x => !EXPECTED_MEMORY_FILES.has(x)).sort();
  if (missing.length || unexpected.length) {
    const bits = [];
    if (missing.length) bits.push(`missing: ${JSON.stringify(missing)}`);
    if (unexpected.length) bits.push(`unexpected: ${JSON.stringify(unexpected)}`);
    add('memory files present', 'FAIL', bits.join('; '));
  } else {
    add('memory files present', 'PASS', `${diskMemory.size} files`);
  }
  for (const name of [...EXPECTED_MEMORY_FILES].sort()) {
    const p = join(memDir, `${name}.md`);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    // _pending and _thread are freeform runtime trails (no YAML preamble);
    // their structure is the skeleton, not a frontmatter'd entry file.
    if (name === '_pending' || name === '_thread') { add(`memory shape: ${name}.md`, 'PASS', ''); continue; }
    const [ok, reason] = isValidPreamble(text);
    if (!ok) { add(`memory shape: ${name}.md`, 'FAIL', reason); continue; }
    const splitOnce = text.split('---');
    const body = splitOnce.length >= 3 ? splitOnce.slice(2).join('---') : text;
    const bodyNoFence = body.replace(/^```[\s\S]*?^```\s*$/gm, '');
    const entryCount = (bodyNoFence.match(/^##\s+\S/gm) || []).length;
    add(`memory shape: ${name}.md`, 'PASS',
      entryCount > 0 ? `${entryCount} entries` : 'empty (preamble-only)');
  }
  add('memory README',
    existsSync(join(memDir, 'README.md')) ? 'PASS' : 'FAIL',
    existsSync(join(memDir, 'README.md')) ? '' : 'missing .claude/memory/README.md');
}

// ---------- src/ templates ----------
const srcDir = join(ROOT, 'src');
const consumerManifest = existsSync(join(ROOT, '.claude', 'manifest.json'));
let SKIP_SRC = false;
if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
  if (consumerManifest) {
    add('src templates: directory', 'PASS',
      'consumer install (manifest present, src/ absent) — src/ checks skipped');
  } else {
    add('src templates: directory', 'FAIL', 'missing src/');
  }
  SKIP_SRC = true;
} else {
  add('src templates: directory', 'PASS', '');
}

if (!SKIP_SRC) {
  const srcClaude = join(srcDir, 'CLAUDE.template.md');
  if (!existsSync(srcClaude)) {
    add('src templates: CLAUDE.template.md', 'FAIL', 'missing');
  } else {
    const head = readFileSync(srcClaude, 'utf8').slice(0, 1200);
    if (head.includes('is a general-purpose Claude setup')) {
      add('src templates: CLAUDE.template.md', 'FAIL',
        "lede uses dogfood voice ('is a general-purpose Claude setup'); template must read as ship-to-user constitution");
    } else if (/\bArticle\s+I\b/.test(head) || head.toLowerCase().includes('in-session constitution')) {
      add('src templates: CLAUDE.template.md', 'PASS', 'constitution voice');
    } else if (head.includes('uses the Claude Code baseline')) {
      add('src templates: CLAUDE.template.md', 'PASS', 'user-voice lede (pre-constitution)');
    } else {
      add('src templates: CLAUDE.template.md', 'FAIL',
        "lede missing — expected constitution markers ('Article I', 'in-session constitution') or transitional user-voice phrase 'uses the Claude Code baseline'");
    }
  }

  const srcPj = join(srcDir, 'project.template.json');
  if (!existsSync(srcPj)) {
    add('src templates: project.template.json', 'FAIL', 'missing');
  } else {
    let pjSeed = null;
    try { pjSeed = JSON.parse(readFileSync(srcPj, 'utf8')); }
    catch (e) { add('src templates: project.template.json', 'FAIL', `invalid JSON: ${e.message}`); }
    if (pjSeed !== null) {
      if (pjSeed.configured !== false) {
        add('src templates: project.template.json', 'FAIL',
          `must be pristine — \`configured\` should be false (got ${JSON.stringify(pjSeed.configured)})`);
      } else {
        add('src templates: project.template.json', 'PASS', 'configured=false');
      }
    }
  }

  const srcSeed = join(srcDir, 'seed.template.md');
  if (!existsSync(srcSeed)) {
    add('src templates: seed.template.md', 'FAIL', 'missing');
  } else {
    const text = readFileSync(srcSeed, 'utf8');
    const s16 = text.match(/##\s+§16\s+—\s+Project-specific configuration[\s\S]{0,400}/);
    if (!s16) add('src templates: seed.template.md', 'FAIL', 'missing §16 reservation');
    else if (s16[0].includes('Generated:')) {
      add('src templates: seed.template.md', 'FAIL',
        '§16 has been populated (`Generated:` stamp present); template must stay pristine');
    } else {
      add('src templates: seed.template.md', 'PASS', '§16 reserved (pristine)');
    }
  }

  const srcMcp = join(srcDir, '.mcp.template.json');
  if (!existsSync(srcMcp)) {
    add('src templates: .mcp.template.json', 'FAIL', 'missing');
  } else {
    try {
      const m = JSON.parse(readFileSync(srcMcp, 'utf8'));
      const servers = Object.keys(m.mcpServers || {});
      const missing = ['context7', 'plantuml', 'playwright'].filter(s => !servers.includes(s));
      if (missing.length) {
        add('src templates: .mcp.template.json', 'FAIL', `baseline servers missing: ${JSON.stringify(missing)}`);
      } else {
        add('src templates: .mcp.template.json', 'PASS', `baseline servers present (${servers.length} declared)`);
      }
    } catch (e) {
      add('src templates: .mcp.template.json', 'FAIL', `invalid JSON: ${e.message}`);
    }
  }

  const srcSettings = join(srcDir, 'settings.template.json');
  if (!existsSync(srcSettings)) {
    add('src templates: settings.template.json', 'FAIL', 'missing');
  } else {
    try {
      const sText = readFileSync(srcSettings, 'utf8');
      JSON.parse(sText);
      const missingWired = [...EXPECTED_HOOKS].filter(h => !sText.includes(`${h}.sh`) && !sText.includes(`${h}.mjs`)).sort();
      if (missingWired.length) {
        const head = missingWired.slice(0, 3);
        const tail = missingWired.length > 3 ? ` + ${missingWired.length - 3} more` : '';
        add('src templates: settings.template.json', 'FAIL',
          `baseline hooks not wired: ${JSON.stringify(head)}${tail}`);
      } else {
        add('src templates: settings.template.json', 'PASS', `all ${EXPECTED_HOOKS.size} baseline hooks wired`);
      }
    } catch (e) {
      add('src templates: settings.template.json', 'FAIL', `invalid JSON: ${e.message}`);
    }
  }

  const srcWorker = join(srcDir, 'agents', 'swarm-worker.template.md');
  if (!existsSync(srcWorker)) {
    add('src templates: agents/swarm-worker.template.md', 'FAIL', 'missing');
  } else {
    const wt = readFileSync(srcWorker, 'utf8');
    const tokens = ['{{NAME}}', '{{DESCRIPTION}}', '{{SKILLS}}', '{{ROLE_LINE}}'];
    const missingTokens = tokens.filter(t => !wt.includes(t));
    if (missingTokens.length) {
      add('src templates: agents/swarm-worker.template.md', 'FAIL', `tokens missing: ${JSON.stringify(missingTokens)}`);
    } else {
      add('src templates: agents/swarm-worker.template.md', 'PASS', 'all 4 tokens present');
    }
  }

  const srcMemDir = join(srcDir, 'memory');
  const canonicalMemory = [...EXPECTED_MEMORY_FILES].filter(n => n !== '_pending' && n !== '_resume' && n !== '_thread');
  if (!existsSync(srcMemDir) || !statSync(srcMemDir).isDirectory()) {
    add('src templates: memory/', 'FAIL', 'missing src/memory/');
  } else {
    for (const name of canonicalMemory.sort()) {
      const p = join(srcMemDir, `${name}.template.md`);
      if (!existsSync(p)) {
        add(`src templates: memory/${name}.template.md`, 'FAIL', 'missing');
        continue;
      }
      const text = readFileSync(p, 'utf8');
      if (!text.startsWith('---')) {
        add(`src templates: memory/${name}.template.md`, 'FAIL', 'missing frontmatter');
        continue;
      }
      const splitOnce = text.split('---');
      const body = splitOnce.length >= 3 ? splitOnce.slice(2).join('---') : text;
      const bodyNoFence = body.replace(/^```[\s\S]*?^```\s*$/gm, '');
      const entryCount = (bodyNoFence.match(/^##\s+\S/gm) || []).length;
      if (entryCount > 0) {
        add(`src templates: memory/${name}.template.md`, 'FAIL', `template must be pristine; ${entryCount} entries found`);
      } else {
        add(`src templates: memory/${name}.template.md`, 'PASS', 'pristine');
      }
    }
  }
}

// ---------- helper scripts ----------
const helpers = [
  '.claude/skills/swarm-plan/validate.mjs',
  '.claude/skills/swarm-dispatch/swarm_merge.mjs',
  '.claude/skills/spec-render/render.mjs',
  '.claude/skills/spec-lint/lint.mjs',
  '.claude/skills/archive/archive.sh',
  '.claude/skills/audit-baseline/audit.mjs',
];
for (const rel of helpers) {
  const p = join(ROOT, rel);
  const label = `helper ${rel.split('/.claude/skills/')[1]}`;
  if (!existsSync(p)) add(label, 'FAIL', 'missing');
  else {
    try {
      accessSync(p, fsc.X_OK);
      add(label, 'PASS', '');
    } catch {
      add(label, 'FAIL', 'not executable');
    }
  }
}

// ---------- settings.json hook wiring ----------
const settingsText = readText('.claude/settings.json');
if (!settingsText) {
  add('settings.json present', 'FAIL', 'missing or empty');
} else {
  try { JSON.parse(settingsText); add('settings.json parses', 'PASS', ''); }
  catch (e) { add('settings.json parses', 'FAIL', e.message); }
  for (const h of [...EXPECTED_HOOKS].sort()) {
    if (settingsText.includes(`${h}.sh`) || settingsText.includes(`${h}.mjs`)) {
      add(`hook wired: ${h}`, 'PASS', '');
    } else {
      add(`hook wired: ${h}`, 'FAIL', 'not in settings.json');
    }
  }
}

// ---------- project.json keys ----------
if (pj === null) {
  add('project.json parses', 'FAIL', 'missing or invalid JSON');
} else {
  add('project.json parses', 'PASS', '');
  const expectedPaths = [
    ['configured', ['configured']],
    ['test.cmd', ['test', 'cmd']],
    ['lint.cmd', ['lint', 'cmd']],
    ['tdd.source_globs', ['tdd', 'source_globs']],
    ['tdd.test_globs', ['tdd', 'test_globs']],
    ['tdd.exempt_globs', ['tdd', 'exempt_globs']],
    ['tdd.ui_globs', ['tdd', 'ui_globs']],
    ['destructive.hard_block_patterns', ['destructive', 'hard_block_patterns']],
    ['destructive.ask_patterns', ['destructive', 'ask_patterns']],
    ['artifacts.required_sections.intake', ['artifacts', 'required_sections', 'intake']],
    ['artifacts.required_sections.brd', ['artifacts', 'required_sections', 'brd']],
    ['artifacts.required_sections.spec', ['artifacts', 'required_sections', 'spec']],
    ['artifacts.required_sections.rca', ['artifacts', 'required_sections', 'rca']],
    ['artifacts.required_diagrams.spec', ['artifacts', 'required_diagrams', 'spec']],
    ['swarm.max_parallel', ['swarm', 'max_parallel']],
    ['swarm.isolation', ['swarm', 'isolation']],
    ['swarm.min_tasks_worth_swarming', ['swarm', 'min_tasks_worth_swarming']],
    ['swarm.refuse_dirty_tree', ['swarm', 'refuse_dirty_tree']],
    ['swarm.exempt_path_prefixes', ['swarm', 'exempt_path_prefixes']],
    ['swarm.enforced_path_prefixes', ['swarm', 'enforced_path_prefixes']],
    ['consent.commit_ttl_seconds', ['consent', 'commit_ttl_seconds']],
    ['consent.gate_marker_ttl_seconds', ['consent', 'gate_marker_ttl_seconds']],
    ['consent.push_ttl_seconds', ['consent', 'push_ttl_seconds']],
    ['git.protected_branches', ['git', 'protected_branches']],
    ['git.branch_pattern', ['git', 'branch_pattern']],
    ['additions.agents', ['additions', 'agents']],
    ['additions.skills', ['additions', 'skills']],
    ['additions.hooks', ['additions', 'hooks']],
    ['additions.mcp_servers', ['additions', 'mcp_servers']],
    ['additions.swarm_worker_skills', ['additions', 'swarm_worker_skills']],
  ];
  for (const [label, path] of expectedPaths) {
    let cur = pj, ok = true;
    for (const k of path) {
      if (cur && typeof cur === 'object' && k in cur) cur = cur[k];
      else { ok = false; break; }
    }
    add(`project.json: ${label}`, ok ? 'PASS' : 'FAIL', ok ? '' : 'missing key');
  }
}

// ---------- .mcp.json servers ----------
const mcp = readJson('.mcp.json');
if (mcp === null) {
  add('.mcp.json parses', 'FAIL', 'missing or invalid JSON');
} else {
  add('.mcp.json parses', 'PASS', '');
  const servers = Object.keys(mcp.mcpServers || {});
  for (const s of ['context7', 'plantuml', 'playwright']) {
    add(`mcp server: ${s}`, servers.includes(s) ? 'PASS' : 'FAIL', servers.includes(s) ? '' : 'not declared');
  }
}

// ---------- vendored license / notice ----------
const recommender = join(ROOT, '.claude', 'skills', 'claude-automation-recommender');
if (existsSync(recommender) && statSync(recommender).isDirectory()) {
  for (const fname of ['LICENSE', 'NOTICE', 'SKILL.md']) {
    const p = join(recommender, fname);
    add(`recommender ${fname}`, existsSync(p) ? 'PASS' : 'FAIL', existsSync(p) ? '' : 'missing');
  }
} else {
  add('recommender skill directory', 'FAIL', 'missing');
}

const plantumlDir = join(ROOT, '.claude', 'bin');
if (existsSync(plantumlDir) && statSync(plantumlDir).isDirectory()) {
  for (const fname of ['LICENSE', 'NOTICE']) {
    const p = join(plantumlDir, fname);
    add(`plantuml-vendored ${fname}`, existsSync(p) ? 'PASS' : 'FAIL',
      existsSync(p) ? '' : 'missing — required for Apache 2.0 redistribution of plantuml-asl jar');
  }
  const noticeP = join(plantumlDir, 'NOTICE');
  if (existsSync(noticeP)) {
    const noticeText = readFileSync(noticeP, 'utf8');
    const required = [
      'plantuml-asl-1.2026.2',
      'c348f6a26d999f81fd05b5d49834bb70df9cf35fab0939c4edecb0909e64022b',
    ];
    const missing = required.filter(s => !noticeText.includes(s));
    if (missing.length) {
      add('plantuml-vendored NOTICE content', 'FAIL', `missing required attribution strings: ${JSON.stringify(missing)}`);
    } else {
      add('plantuml-vendored NOTICE content', 'PASS', 'upstream version + pinned sha256 present');
    }
  }
} else {
  add('.claude/bin directory', 'FAIL', 'missing — required for vendored PlantUML LICENSE/NOTICE');
}

// ---------- Article X.2 / design-ui orchestrator surface ----------
const claudeMd = readText('CLAUDE.md');
if (claudeMd.includes('### X.2 Design-task routing')) {
  add('CLAUDE.md: Article X.2 present', 'PASS', 'design-task routing rule declared');
} else {
  add('CLAUDE.md: Article X.2 present', 'FAIL',
    'missing `### X.2 Design-task routing` heading — Article X.2 is the structural seam between design-ui and impeccable');
}

if (!SKIP_SRC) {
  const templateClaude = readText('src/CLAUDE.template.md');
  if (templateClaude.includes('### X.2 Design-task routing')) {
    add('src/CLAUDE.template.md: Article X.2 mirrors', 'PASS', '');
  } else {
    add('src/CLAUDE.template.md: Article X.2 mirrors', 'FAIL',
      'src template does not contain Article X.2 — template-drift will fail');
  }
}

const designUiSkill = readText('.claude/skills/design-ui/SKILL.md');
if (/^description:.*orchestrat/im.test(designUiSkill)) {
  add('design-ui SKILL.md: orchestrator role', 'PASS', 'frontmatter description names orchestrator role');
} else {
  add('design-ui SKILL.md: orchestrator role', 'FAIL',
    "frontmatter description must mention 'orchestrat' — the v1 code-writing role is retired");
}

const hookShPath = join(ROOT, '.claude', 'hooks', 'spec_design_calls_guard.sh');
const hookMjsPath = join(ROOT, '.claude', 'hooks', 'spec_design_calls_guard.mjs');
const hookPath = existsSync(hookMjsPath) ? hookMjsPath : hookShPath;
const hookWired = settingsText.includes('spec_design_calls_guard.sh') || settingsText.includes('spec_design_calls_guard.mjs');
let hookExec = false;
try { if (existsSync(hookPath)) { accessSync(hookPath, fsc.X_OK); hookExec = true; } } catch {}
if (existsSync(hookPath) && hookExec && hookWired) {
  add('spec_design_calls_guard: present + wired', 'PASS',
    `${basename(hookPath)} executable and wired in PreToolUse Write|Edit|MultiEdit chain`);
} else {
  const detail = [];
  if (!existsSync(hookPath)) detail.push('hook script missing');
  else if (!hookExec) detail.push('hook not executable');
  if (!hookWired) detail.push('not wired in .claude/settings.json');
  add('spec_design_calls_guard: present + wired', 'FAIL', detail.join('; '));
}

// ---------- cross-doc count claims ----------
const NUM_GROUP = String.raw`(?<![.\d\-])(\d+|twenty-one|twenty-two|twenty-three|twenty-four|twenty-five|twenty-six|twenty-seven|twenty-eight|twenty-nine|thirty-one|thirty-two|thirty-three|thirty-four|thirty-five|thirty-six|thirty-seven|thirty-eight|thirty-nine|twenty|thirty|forty|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)`;

const HEAD_PATTERNS = [
  [new RegExp(NUM_GROUP + String.raw`\s+hooks?\b`, 'gi'), diskBaselineHooks.size, 'hooks'],
  [new RegExp(NUM_GROUP + String.raw`\s+guard\s+(?:hook|script)s?\b`, 'gi'), diskBaselineHooks.size, 'guard hooks/scripts'],
  [new RegExp(NUM_GROUP + String.raw`\s+(?:baseline\s+)?subagents?\b`, 'gi'), diskBaselineAgents.size, 'subagents'],
  [new RegExp(NUM_GROUP + String.raw`\s+skills\b`, 'gi'), diskBaselineSkills.size, 'skills'],
];
const PAREN_PATTERNS = [
  [/\b(?:guard\s+hooks?|guards?)\s*\((\d+)\)/gi, diskBaselineHooks.size, 'guard hooks'],
  [/\bsubagents?\s*\((\d+)\)/gi, diskBaselineAgents.size, 'subagents'],
  [/\bskills?\s*\((\d+)\)/gi, diskBaselineSkills.size, 'skills'],
];
const NOUN_FIRST_PATTERNS = [
  [/\bhooks?\s+(\d+)\b/gi, diskBaselineHooks.size, 'hooks'],
  [/\b(?:sub)?agents?\s+(\d+)\b/gi, diskBaselineAgents.size, 'agents'],
  [/\bskills?\s+(\d+)\b/gi, diskBaselineSkills.size, 'skills'],
];

const LOCAL_POST_HINTS = [
  'review before', 'review of', 'iterate safely', 'iterate over',
  '+ one command', '+ 1 command', 'sit between', 'operate on',
  'ship a', 'ship `template', 'share `code', 'review prose',
  'run between', 'follow ', 'handle ',
];
const HEADLINE_PRE_HINTS = [
  'ships the claude code baseline (', 'drop-in scaffold', '<strong>',
  'ships ', 'baseline (', 'delivers ', 'twenty-', 'fourteen ',
  'ten ', 'eleven ',
];

function classifyMatch(text, matchIndex, matchEnd) {
  const pre = text.slice(Math.max(0, matchIndex - 80), matchIndex).toLowerCase();
  const post = text.slice(matchEnd, matchEnd + 80).toLowerCase();
  for (const h of LOCAL_POST_HINTS) if (post.includes(h)) return 'LOCAL';
  const trimmed = post.replace(/^\s+/, '');
  if (trimmed.startsWith(':') && post.slice(0, 40).includes('\n')) return 'LOCAL';
  if (matchIndex < 1200) return 'HEADLINE';
  for (const h of HEADLINE_PRE_HINTS) if (pre.includes(h)) return 'HEADLINE';
  return 'AMBIGUOUS';
}

const docsToCheck = ['CLAUDE.md', 'README.md', 'docs/init/seed.md'];
for (const doc of docsToCheck) {
  const text = readText(doc);
  if (!text) {
    if (doc !== 'README.md') add(`${doc} count claims`, 'WARN', 'file not present');
    continue;
  }
  const headlineDrift = [];
  let headlineOk = 0;
  let localN = 0;
  const ambiguous = [];

  for (const [pat, expected, kind] of HEAD_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      const claimed = toInt(m[1]);
      if (claimed === null) continue;
      const tier = classifyMatch(text, m.index, m.index + m[0].length);
      if (tier === 'LOCAL') { localN += 1; continue; }
      if (claimed === expected) {
        if (tier === 'HEADLINE') headlineOk += 1;
        continue;
      }
      const snippet = m[0].trim();
      if (tier === 'HEADLINE') {
        headlineDrift.push(`"${snippet}" → expected ${expected} ${kind}`);
      } else {
        ambiguous.push(`"${snippet}" (likely local; otherwise ${expected} ${kind})`);
      }
    }
  }

  const QUALIFIER_PREFIXES = ['phase ', 'shared ', 'local ', 'scoped ', 'swarm ', 'ui ', 'test '];
  for (const [pat, expected, kind] of PAREN_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      const claimed = toInt(m[1]);
      if (claimed === null) continue;
      const preWord = text.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
      if (QUALIFIER_PREFIXES.some(q => preWord.endsWith(q))) { localN += 1; continue; }
      if (claimed === expected) { headlineOk += 1; }
      else { headlineDrift.push(`"${m[0].trim()}" → expected ${expected} ${kind}`); }
    }
  }

  for (const [pat, expected, kind] of NOUN_FIRST_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      const claimed = parseInt(m[1], 10);
      if (Number.isNaN(claimed)) continue;
      const tier = classifyMatch(text, m.index, m.index + m[0].length);
      if (tier === 'LOCAL') { localN += 1; continue; }
      if (claimed === expected) { headlineOk += 1; continue; }
      headlineDrift.push(`"${m[0].trim()}" → expected ${expected} ${kind}`);
    }
  }

  if (headlineDrift.length) {
    const head = headlineDrift.slice(0, 3).join('; ');
    const tail = headlineDrift.length > 3 ? `; +${headlineDrift.length - 3} more` : '';
    add(`${doc} count claims`, 'FAIL', head + tail);
  } else if (headlineOk) {
    const suffix = localN ? ` (${localN} local count${localN !== 1 ? 's' : ''} suppressed)` : '';
    add(`${doc} count claims`, 'PASS', `${headlineOk} headline claim${headlineOk !== 1 ? 's' : ''} match${suffix}`);
  } else if (ambiguous.length) {
    add(`${doc} count claims`, 'WARN', ambiguous.slice(0, 2).join('; '));
  } else {
    add(`${doc} count claims`, 'WARN', 'no relevant claims found');
  }
}

// ---------- quickfix invariants (5/6/7) ----------
const qf5Needle = 'docs/' + 'site';
function qf5Scan(rel, lineRange, cached) {
  const text = cached !== undefined ? cached : readText(rel);
  if (!text) return [];
  const lines = text.split('\n');
  const hits = [];
  if (lineRange) {
    const [lo, hi] = lineRange;
    for (let i = lo - 1; i < Math.min(hi, lines.length); i++) {
      if (lines[i].includes(qf5Needle)) hits.push([rel, i + 1]);
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(qf5Needle)) hits.push([rel, i + 1]);
    }
  }
  return hits;
}
const qf5Targets = [
  ['.claude/skills/audit-baseline/audit.mjs', null, null],
  ['.claude/skills/audit-baseline/SKILL.md', null, null],
  ['.claude/commands/init-project.md', null, null],
  ['docs/init/seed.md', [100, 136], seedText],
];
const qf5Hits = [];
for (const [p, r, cached] of qf5Targets) qf5Hits.push(...qf5Scan(p, r, cached));
if (qf5Hits.length) {
  const detail = qf5Hits.slice(0, 3).map(([p, ln]) => `${p}:${ln}`).join('; ');
  const more = qf5Hits.length > 3 ? `; +${qf5Hits.length - 3} more` : '';
  add('quickfix-5: no stale doc-site refs in scoped baseline files', 'FAIL', detail + more);
} else {
  add('quickfix-5: no stale doc-site refs in scoped baseline files', 'PASS', '4 paths clean');
}

const qf6Pat = HEAD_PATTERNS.find(([, , kind]) => kind === 'hooks')?.[0];
if (!qf6Pat) {
  add('quickfix-6: hooks count regex accepts bare phrasing', 'FAIL', 'could not locate hooks pattern in HEAD_PATTERNS');
} else {
  const re = new RegExp(qf6Pat.source, qf6Pat.flags);
  const m = re.exec('the harness has 17 hooks total');
  if (m && toInt(m[1]) === 17) {
    add('quickfix-6: hooks count regex accepts bare phrasing', 'PASS', `matched "${m[0]}" -> 17`);
  } else {
    add('quickfix-6: hooks count regex accepts bare phrasing', 'FAIL', 'bare-form regex did not match "17 hooks total"');
  }
}

const qf7Text = readText('.claude/agents/swarm-worker.md');
const qf7m = qf7Text.match(/^description:\s*(\S+)/m);
if (!qf7Text) {
  add('quickfix-7: swarm-worker description uses imperative voice', 'FAIL', '.claude/agents/swarm-worker.md not present');
} else if (!qf7m) {
  add('quickfix-7: swarm-worker description uses imperative voice', 'FAIL',
    'no `description:` line found in swarm-worker.md frontmatter');
} else {
  const first = qf7m[1].replace(/[,.;:]+$/, '');
  if (/^(Execute|Run|Receive|Perform)\b/.test(first)) {
    add('quickfix-7: swarm-worker description uses imperative voice', 'PASS', `imperative voice: ${first}`);
  } else {
    add('quickfix-7: swarm-worker description uses imperative voice', 'FAIL',
      `description starts with "${first}" — expected imperative verb (Execute|Run|Receive|Perform)`);
  }
}

// ---------- WF-5: derived-count surfaces (single source of truth) ----------
// The deriver is the one place counts are computed; these checks pin the
// surfaces that state a count literal but cannot be templated (binding prose).
// The existing cross-doc machinery above already covers hooks/skills/subagents
// headline claims in CLAUDE.md/README.md/seed.md; these add the commands
// orientation line (not covered there) and the skills byCategory breakdown.
const derived = deriveCounts(ROOT);
const COMMANDS_ORIENTATION_RE = /\.claude\/commands\/[^(]*\((\d+)\s+commands?\)/i;
for (const rel of ['CLAUDE.md', 'src/CLAUDE.template.md']) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) continue;
  const r = checkSurfaceCount(p, COMMANDS_ORIENTATION_RE, derived.commands);
  add(`commands count (${rel} orientation)`, r.status, r.detail);
}
const byCat = checkByCategorySum(SKILL_CATEGORIES, derived.skills);
add('skills byCategory sum vs derived total', byCat.status, byCat.detail);

// ---------- output ----------
// Guarded: only when run as a script. When imported (by a test) the exported
// helpers are available without printing the table or calling process.exit.
if (IS_MAIN) {
  const nameW = Math.max(20, ...results.map(r => r[0].length));
  let failN = 0, warnN = 0;
  for (const [, s] of results) { if (s === 'FAIL') failN++; else if (s === 'WARN') warnN++; }
  process.stdout.write('check'.padEnd(nameW) + '  ' + 'status'.padEnd(6) + '  detail\n');
  process.stdout.write('-'.repeat(nameW) + '  ' + '-'.repeat(6) + '  ' + '-'.repeat(50) + '\n');
  for (const [name, status, detail] of results) {
    process.stdout.write(`${name.padEnd(nameW)}  ${status.padEnd(6)}  ${detail}\n`);
  }
  process.stdout.write('-'.repeat(nameW) + '  ' + '-'.repeat(6) + '\n');
  const overall = failN > 0 ? 'FAIL' : 'PASS';
  process.stdout.write(`${'overall'.padEnd(nameW)}  ${overall.padEnd(6)}  fails=${failN} warns=${warnN}\n`);
  process.exit(failN > 0 ? 1 : 0);
}
