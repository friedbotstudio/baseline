#!/usr/bin/env node
// Covers AC-003 of remove-python-runtime-dep.
// spec-lint — run the diagram-spec checks against a saved spec.
// Usage: lint.mjs <slug>

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveProfile } from '../../hooks/lib/write-set-profile.mjs';
import { STRUCTURAL_KINDS, elementReferences } from '../../hooks/lib/corpus-reference.mjs';
import { plantumlBlocks, missingKinds } from '../../hooks/lib/plantuml-blocks.mjs';
import { parseDesignCalls, findRowDefects } from '../../hooks/lib/design-calls.mjs';
import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { parseDelta } from '../workspace/delta.mjs';
import { anchorSurfaceVerdict } from '../workspace/coverage.mjs';
import { matchesAnyGlob } from '../../hooks/lib/glob-match.mjs';

function fail(msg) { process.stderr.write(`spec-lint: ${msg}\n`); }

function hasPlantumlCli() {
  const r = spawnSync('plantuml', ['-version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
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

function checkPresence(blocks, pj, spec, root) {
  let required;
  let profile = {};
  try {
    // Honor the write-set-gated diagram profile (same resolver the
    // spec_diagram_presence_guard hook uses) so spec-lint and the write-boundary
    // guard never disagree on a non-architectural spec's reduced diagram set.
    const projectGet = (dotted) =>
      dotted.replace(/^\./, '').split('.').reduce((n, k) => (n == null ? undefined : n[k]), pj);
    profile = resolveProfile(spec, projectGet);
    required = profile.required_diagrams;
  } catch {
    return ['SKIP', 'required_diagrams.spec not configured'];
  }
  if (!required || typeof required !== 'object') {
    return ['SKIP', 'required_diagrams.spec not configured'];
  }
  // Same rule the guard applies, from the module that owns it.
  const missing = missingKinds(blocks, required)
    .map(({ kind, need, found }) => ({ kind, label: `${kind} (need ${need}, found ${found})` }));

  // Spec-as-diff, resolved exactly as spec_diagram_presence_guard resolves it. The
  // shared rule lives in corpus-reference; only the verdict differs — the guard
  // blocks an unresolvable id at the write boundary, the preflight reports it here.
  const unresolved = unresolvedReferences(spec, root);
  if (unresolved.length) {
    return ['FAIL', 'unresolvable corpus references: ' + unresolved.join(', ')];
  }
  if (elementReferences(spec).length) {
    for (let i = missing.length - 1; i >= 0; i -= 1) {
      if (STRUCTURAL_KINDS.has(missing[i].kind)) missing.splice(i, 1);
    }
  }

  // Reported on PASS too. A spec that draws every diagram anyway satisfies the
  // full set without the author ever learning their reduction was refused, which
  // is how the shipped template's own broken reference stayed invisible.
  const because = profile.reason ? ` (full set forced: ${profile.reason})` : '';
  return missing.length === 0
    ? ['PASS', 'all kinds present' + because]
    : ['FAIL', 'missing: ' + missing.map((m) => m.label).join(', ') + because];
}

function unresolvedReferences(spec, root) {
  return elementReferences(spec)
    .filter((id) => !existsSync(join(root, 'docs', 'system', 'elements', `${id}.md`)));
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

function checkDesignCalls(spec, pj) {
  let uiGlobs;
  try { uiGlobs = pj?.tdd?.ui_globs || []; } catch { return ['SKIP', 'tdd.ui_globs not configured']; }
  if (!uiGlobs.length) return ['SKIP', 'tdd.ui_globs is empty'];

  // Must match the guard exactly, including the bolded template form
  // (`**Write set**: ...`) and the prose form — see spec_design_calls_guard.mjs
  // and hooks/lib/write-set-profile.mjs.
  const writeSetPaths = new Set();
  for (const line of spec.split('\n')) {
    const m = line.match(/write[_\s]set\*{0,2}\s*(?::|is\s)\s*(.+)$/i);
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

  // Validate via the shared lib — the same rule the write-boundary guard applies.
  const section = parseDesignCalls(spec);
  if (section.isNone || section.rows.length === 0) {
    return ['FAIL', `write_set has UI files (${uiHits.sort().join(', ')}) but no populated \`## Design calls\` section`];
  }
  const defects = findRowDefects(section);
  if (defects.length) {
    const detail = defects.map(d => `row '${d.slug}' missing ${d.missing.join(', ')}`).join('; ');
    return ['FAIL', `Design calls incomplete: ${detail}`];
  }
  return ['PASS', `${uiHits.length} UI path(s) match design_calls rows`];
}

// system_delta — every declared delta row must resolve: an `add` anchors inside the
// governed surface, a `change`/`remove` names an element that exists.
//
// Named, not numbered: the ordinals in this file already disagree with the report's
// print order (checkCodesignDecisions is commented "#4" but prints last), and
// site-src/pm-mode.njk repeats that "#4" downstream. Adding another number would
// deepen a drift that a name avoids entirely.
//
// The flag is read from the already-parsed project.json rather than through
// workspace/flags.mjs, which resolves it from disk by rootDir and so cannot answer
// for the config lint has in hand. SKIP (never FAIL) when it is off: lint.mjs ships,
// and src/project.template.json omits the block, so a hard failure here would fire
// on every consumer spec.
export function checkSystemDelta(spec, pj, root) {
  if (pj?.memory?.architecture_map?.enabled !== true) {
    return ['SKIP', 'memory.architecture_map.enabled is not true'];
  }
  if (!/^##\s+System\s+delta\s*$/m.test(spec)) {
    return ['FAIL', "no '## System delta' section"];
  }

  const { rows, errors, empty } = parseDelta(spec);
  if (empty) return ['PASS', 'no governed-surface change declared'];

  const defects = [...errors, ...deltaRowDefects(rows, root)];
  return defects.length === 0
    ? ['PASS', `${rows.length} delta row(s) resolve`]
    : ['FAIL', defects.join('; ')];
}

// AC-013: an `add` row declares an element that may not exist on disk yet, so it
// resolves against the DECLARED governed surface (anchorSurfaceVerdict), never a
// disk walk — a greenfield directory would otherwise match nothing and no new
// element could ever be declared before its code exists.
function deltaRowDefects(rows, root) {
  const isAdd = (row) => row.verb.toLowerCase() === 'add';
  return rows.flatMap((row) => (isAdd(row)
    ? anchorDefects(row, root)
    : elementDefects(row, root)));
}

const ANCHOR_FAIL_REASONS = {
  'outside-root': 'falls outside every declared governed root',
  'undeclared-extension': 'has an extension that is not a declared code extension',
  excluded: 'falls under a declared excluded segment or tree',
};

function anchorDefects(row, root) {
  const verdict = anchorSurfaceVerdict(row.anchor, { rootDir: root });
  if (verdict.ok) return [];
  const detail = ANCHOR_FAIL_REASONS[verdict.reason] || 'does not satisfy the governed-surface declaration';
  return [`add row ${row.elementId}: anchor ${row.anchor} ${detail}`];
}

function elementDefects(row, root) {
  try {
    assertSafeSlug(row.elementId, 'delta element id');
  } catch (e) {
    return [`${row.verb} row: ${e.message}`];
  }
  if (existsSync(join(root, 'docs', 'system', 'elements', `${row.elementId}.md`))) return [];
  return [`${row.verb} row: element id ${row.elementId} does not resolve under docs/system/elements/`];
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

// --- Foundation: the epic spec's two AC-to-slice records ---------------------

const AC_SECTION_RE = /##\s+Acceptance criteria([\s\S]*?)(?=^##\s|$(?![\s\S]))/m;
const SLICE_SECTION_RE = /^##\s+Slice\s+(\S+)\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/gim;

function acIdsInSpec(spec) {
  const m = String(spec ?? '').match(AC_SECTION_RE);
  if (!m) return [];
  return [...new Set([...m[1].matchAll(/\|\s*(AC-\d+)\s*\|/g)].map((r) => r[1]))];
}

// Spec-side ownership: slice id -> the ACs its section claims.
function sliceOwnershipInSpec(spec) {
  const owners = new Map();
  for (const m of String(spec ?? '').matchAll(SLICE_SECTION_RE)) {
    const acs = [...m[2].matchAll(/AC-\d+/g)].map((r) => r[0]);
    owners.set(m[1], [...new Set(acs)]);
  }
  return owners;
}

// State-side ownership, from the file an epic-child actually inherits.
function sliceOwnershipInState(slug, rootDir) {
  const path = join(rootDir, '.claude', 'state', 'epic', `${slug}.json`);
  if (!existsSync(path)) return null;
  let state;
  try { state = JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  const owners = new Map();
  for (const slice of Array.isArray(state.slices) ? state.slices : []) {
    owners.set(String(slice?.id), (Array.isArray(slice?.acs) ? slice.acs : []).map(String));
  }
  return owners;
}

function claimantsOf(owners) {
  const claims = new Map();
  for (const [sliceId, acs] of owners) {
    for (const ac of acs) claims.set(ac, [...(claims.get(ac) ?? []), sliceId]);
  }
  return claims;
}

// --- Domain: the epic AC-to-slice rule seed.md §18.9 states in prose ----------

// Every AC in an epic spec belongs to exactly one slice. An AC owned by nobody is
// an exit criterion the epic silently drops; an AC owned twice is two children
// building the same thing. Epic-only — every other track has no slices, so the
// check reports SKIP rather than inventing a failure.
export function checkEpicSliceAssignment(spec, workflow) {
  if (workflow?.track_id !== 'epic') return ['SKIP', 'not the epic track'];

  const acs = acIdsInSpec(spec);
  if (acs.length === 0) return ['SKIP', 'no AC rows to assign'];

  const claims = claimantsOf(sliceOwnershipInSpec(spec));
  const orphaned = acs.filter((ac) => !claims.has(ac));
  const doubled = acs.filter((ac) => (claims.get(ac) ?? []).length > 1);

  const problems = [];
  if (orphaned.length) problems.push(`assigned to no slice: ${orphaned.join(', ')}`);
  for (const ac of doubled) problems.push(`${ac} claimed by ${claims.get(ac).join(' and ')}`);
  if (problems.length) return ['FAIL', `epic-slice-assignment: ${problems.join('; ')}`];

  return ['PASS', `${acs.length} ACs each assigned to exactly one slice`];
}

// The spec and the epic state file both record AC-to-slice ownership, and an
// epic-child reads the spec. When they disagree the state's claim is invisible to
// the thing that builds from it, which is how an exit criterion goes missing while
// both records look populated.
export function checkEpicStateConsistency(spec, workflow) {
  if (workflow?.track_id !== 'epic') return ['SKIP', 'not the epic track'];

  const root = workflow?.rootDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const stateOwners = sliceOwnershipInState(workflow?.slug, root);
  if (!stateOwners) return ['SKIP', 'no readable epic state file'];

  const specClaims = claimantsOf(sliceOwnershipInSpec(spec));
  const problems = [];
  for (const [sliceId, acs] of stateOwners) {
    for (const ac of acs) {
      const inSpec = specClaims.get(ac) ?? [];
      if (inSpec.length === 0) problems.push(`state assigns ${ac} to slice ${sliceId}; the spec assigns it to no slice`);
      else if (!inSpec.includes(sliceId)) problems.push(`state assigns ${ac} to slice ${sliceId}; the spec assigns it to ${inSpec.join(' and ')}`);
    }
  }
  if (problems.length) return ['FAIL', `epic-state-consistency: ${problems.join('; ')}`];

  return ['PASS', 'the spec and the epic state file agree on every slice'];
}

// D7 of swarm-mode-first-run-hardening (-e3f2) — advisory check that a
// swarm-bound spec (>= swarm.min_tasks_worth_swarming C4 Components) pins each
// component's API surface in the Contracts table, so swarm-plan's decomposition
// is complete pre-dispatch. ADVISORY: returns {ok:false} but never blocks.
export function checkApiSurfacePinned(specContent, minComponents) {
  const content = String(specContent == null ? '' : specContent);
  const componentCount = (content.match(/^\s*Component\(/gm) || []).length;
  if (componentCount < minComponents) return { ok: true, reason: '' };

  const m = content.match(/^#{2,3}\s+Contracts\s*$([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/im);
  const body = m ? m[1] : '';
  const dataRows = body.split('\n').filter((raw) => {
    const line = raw.trim();
    if (!line.startsWith('|')) return false;
    if (/^\|[\s:|-]+\|?\s*$/.test(line)) return false; // separator row
    if (/\b(Kind|Name|Input|Output|Errors|Idempotent)\b/.test(line)) return false; // header row
    if (/\*?\(?none\)?\*?/i.test(line) && line.replace(/[|\s*()none]/gi, '') === '') return false; // placeholder
    return true;
  });

  if (dataRows.length === 0) {
    return {
      ok: false,
      reason: 'swarm-bound spec (>= min components) has no pinned API surface — populate the Contracts table so swarm-plan decomposition is complete pre-dispatch',
    };
  }
  return { ok: true, reason: '' };
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
  const blocks = plantumlBlocks(spec);

  const results = [
    ['plantuml_syntax', ...checkSyntax(blocks, hasPuml)],
    ['diagram_presence', ...checkPresence(blocks, pj, spec, root)],
    ['ac_traceability', ...checkTraceability(spec, blocks)],
    ['design_calls', ...checkDesignCalls(spec, pj)],
    ['system_delta', ...checkSystemDelta(spec, pj, root)],
  ];

  // Check #4 — codesign_decisions — only included in the report when
  // workflow.json -> codesign_mode is true. Suppressed entirely otherwise so
  // the row does not appear in output (parallel to design_calls which only
  // fires when tdd.ui_globs intersects the spec write_set).
  const codesignResult = checkCodesignDecisions(spec, root);
  if (codesignResult[0] !== 'SKIP') {
    results.push(['codesign_decisions', ...codesignResult]);
  }

  // Epic-only, and suppressed off the epic track for the same reason as
  // codesign_decisions: a SKIP row for a rule that cannot apply is noise.
  let workflow = {};
  try { workflow = JSON.parse(readFileSync(join(root, '.claude', 'state', 'workflow.json'), 'utf8')); } catch { /* ignore */ }
  const epicContext = { track_id: workflow.track_id, slug, rootDir: root };
  for (const [name, check] of [
    ['epic_slice_assignment', checkEpicSliceAssignment],
    ['epic_state_consistency', checkEpicStateConsistency],
  ]) {
    const result = check(spec, epicContext);
    if (result[0] !== 'SKIP') results.push([name, ...result]);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
