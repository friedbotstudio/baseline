// Domain — the corpus queries the dispatcher exposes.
//
// Split out of cli.mjs at the simplify pass: nine handlers plus wiring put that
// file at 198 substantive lines against the ~80 ceiling, and the handlers are the
// half that carries logic. Multi-hop reachability in particular is a graph
// traversal, not an entry point, so it belongs on this side of the line.
//
// Every function returns `{ text, data }`. The dispatcher chooses which to print;
// nothing here knows about stdout or exit codes.

import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { EXIT_NOT_FOUND, EXIT_OK, NotFoundError, UsageError, lines, requireValue, refuseBulk } from '../lib/argv.mjs';
import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { surfaceGovernedMemory } from '../../hooks/lib/governed-memory.mjs';
import { assertNoTraversal } from './tree.mjs';
import { readRecords } from './store.mjs';
import { readConcepts, conceptsFor } from './concepts.mjs';
import { deriveEdges } from './edges.mjs';
import { readShard, writeDiagramShard } from './shards.mjs';
import { findGaps } from './coverage.mjs';
import { composeView, generateView } from './render.mjs';
import { classify, reconcile as reconcileCorpus } from './reconcile.mjs';
import { roll } from './roll.mjs';
import { buildGraphDocument } from './graph.mjs';
import { workspaceEnabled, annotationsEnabled, architectureMapEnabled } from './flags.mjs';
import { stampElement } from './digest.mjs';
import { verifyAndApplyDelta } from './delta.mjs';
import { restoreDegradedShards } from './restore-degraded-shards.mjs';
import { proposeMap } from './sync.mjs';
import { scanAnnotations } from './annotations.mjs';
import { annotationPlacementAllowed } from './placement.mjs';

const MAX_HOPS = 5;

export function corpusDir({ flags, root }) {
  const given = flags['spec-dir'];
  if (!given) return join(root, 'docs/system');
  if (isAbsolute(given)) return given;
  assertNoTraversal(given);
  return join(root, given);
}

function elementId(value) {
  assertSafeSlug(value, 'element id');
  return value;
}

function hopsFrom(flags) {
  const requested = Number(flags.hops ?? 1);
  if (!Number.isInteger(requested) || requested > MAX_HOPS) {
    throw new Error(`--hops must be an integer no greater than ${MAX_HOPS}; got ${flags.hops}`);
  }
  return Math.max(1, requested);
}

function corpusEdges(ctx) {
  const specDir = corpusDir(ctx);
  return { specDir, edges: deriveEdges(ctx.root, readRecords(specDir, 'elements')) };
}

function elementOr404(specDir, id) {
  const element = readRecords(specDir, 'elements').find((record) => record.id === id);
  if (!element) throw new NotFoundError(`no element \`${id}\` under ${specDir}`);
  return element;
}

// Breadth-first over the derived graph, bounded by hops. Seeded set carries the
// origin so a cycle cannot re-add it and inflate the reported radius.
function reachable(edges, seed, hops, from, to) {
  const seen = new Set([seed]);
  const found = [];
  for (let hop = 0; hop < hops; hop++) {
    for (const edge of edges.filter((e) => seen.has(from(e)) && !seen.has(to(e)))) {
      seen.add(to(edge));
      found.push(edge);
    }
  }
  return found;
}

export function describeElement(ctx) {
  const id = elementId(ctx.positional[0]);
  const specDir = corpusDir(ctx);
  const element = elementOr404(specDir, id);
  const shard = readShard(specDir, id);
  const drifted = classify(specDir, { rootDir: ctx.root }).find((v) => v.element_id === id);
  const data = {
    ...element,
    shard_kind: shard?.kind ?? null,
    concepts: conceptsFor(specDir, id).map((concept) => concept.id),
    digest: element.anchor_digest ?? 'none',
    digest_state: drifted?.state ?? 'fresh',
  };
  return {
    data,
    text: lines([
      `id       ${data.id}`,
      `title    ${data.title ?? data.id}`,
      `anchor   ${data.anchor ?? '(none)'}`,
      `kind     ${data.kind ?? 'component'}`,
      `shard    ${data.shard_kind ?? '(no shard)'}`,
      `concepts ${data.concepts.join(', ') || '(none)'}`,
      `digest   ${data.digest} (${data.digest_state})`,
    ]),
  };
}

// A glob-anchored element derives no edges BY DESIGN — fileAnchored excludes it,
// because attributing a specific import to "the whole skills layer" would be a
// claim the code does not make. 53 of 114 elements land here, so the reason is
// printed rather than left as a bare empty result a reader would call safe.
export function blastRadius(ctx) {
  const id = elementId(ctx.positional[0]);
  const hops = hopsFrom(ctx.flags);
  const { specDir, edges } = corpusEdges(ctx);
  const element = elementOr404(specDir, id);
  const globAnchored = Boolean(element.anchor?.includes('*'));

  const dependsOn = reachable(edges, id, hops, (e) => e.from, (e) => e.to);
  const dependents = reachable(edges, id, hops, (e) => e.to, (e) => e.from);
  return {
    data: { element: id, hops, globAnchored, dependsOn, dependents },
    text: lines([
      `${id} (${hops} hop${hops === 1 ? '' : 's'})`,
      'depends on:',
      ...(dependsOn.length ? dependsOn.map((e) => `  ${e.kind} -> ${e.to}`) : ['  (none)']),
      'depended on by:',
      ...(dependents.length ? dependents.map((e) => `  ${e.from} (${e.kind})`) : ['  (none)']),
      ...(globAnchored ? ['', 'note: this element is glob-anchored, so edge derivation excludes it by design'] : []),
    ]),
  };
}

export function describeConcept(ctx) {
  const id = elementId(ctx.positional[0]);
  const { specDir, edges } = corpusEdges(ctx);
  const concepts = readConcepts(specDir);
  const concept = concepts.find((record) => record.id === id);
  if (!concept) throw new NotFoundError(`no concept \`${id}\` under ${specDir}`);
  const members = new Set(concept.members ?? []);
  const internal = edges.filter((e) => members.has(e.from) && members.has(e.to));
  const crossing = edges.filter((e) => members.has(e.from) !== members.has(e.to));
  return {
    data: {
      concept: id,
      members: [...members],
      internal,
      crossing,
      rolled: roll(edges, concepts).filter((e) => e.from === id || e.to === id),
    },
    text: lines([
      `${id} — ${concept.title ?? id}`,
      `members  ${members.size}`,
      `internal ${internal.length}`,
      `crossing ${crossing.length}`,
      ...[...members].map((member) => `  ${member}`),
    ]),
  };
}

export function coverage(ctx) {
  const gaps = findGaps({ specDir: corpusDir(ctx), rootDir: ctx.root });
  return { data: { gaps }, text: lines(gaps.length ? gaps : ['(no uncovered governed paths)']) };
}

export function stale(ctx) {
  const drifted = classify(corpusDir(ctx), { rootDir: ctx.root }).filter((v) => v.state === 'stale');
  return {
    data: { stale: drifted },
    text: lines(drifted.length ? drifted.map((v) => `${v.element_id}  ${v.detail ?? ''}`.trim()) : ['(nothing stale)']),
  };
}

// Answers from two sources with different coverage, so the output names which one
// spoke: `governs:` globs reach every path, `rests_on:` is declared on 14 of 114
// elements. A merged list would read as one uniform answer it is not.
export function constraintsFor(ctx) {
  const path = ctx.positional[0];
  if (!path) throw new Error('constraints-for needs a repo-relative path');
  assertNoTraversal(path);
  const governed = surfaceGovernedMemory(path, { rootDir: ctx.root })
    .filter((hit) => hit.category === 'constraints');
  const element = readRecords(corpusDir(ctx), 'elements').find((record) => record.anchor === path);
  const restsOn = element?.rests_on ? String(element.rests_on).split(',').map((s) => s.trim()) : [];
  return {
    data: { path, governs: governed.map((hit) => hit.key), rests_on: restsOn },
    text: lines([
      `constraints governing ${path}`,
      ...(governed.length ? governed.map((hit) => `  ${hit.key}  (via governs:)`) : ['  (none via governs:)']),
      ...(restsOn.length ? restsOn.map((key) => `  ${key}  (via rests_on:)`) : ['  (none via rests_on:)']),
    ]),
  };
}

// The remote PlantUML server is deliberately NOT a fallback: it cannot resolve the
// local !includesub paths a composed view depends on, so it would render a
// silently different — and emptier — diagram than the one asked for.
export function view(ctx) {
  const id = elementId(ctx.positional[0]);
  const specDir = corpusDir(ctx);
  const concept = readConcepts(specDir).find((record) => record.id === id);
  if (!concept) throw new NotFoundError(`no concept \`${id}\` under ${specDir}`);
  const query = { elements: concept.members ?? [], title: concept.title ?? id };
  if (ctx.flags.render !== true) return { data: query, text: composeView(specDir, query) };

  const jarPath = ctx.flags.jar ?? join(ctx.root, '.claude/bin/plantuml.jar');
  if (!existsSync(jarPath)) throw new NotFoundError(`plantuml jar not found at ${jarPath}`);
  return { data: query, text: generateView(specDir, query, { jarPath }).toString() };
}

export function graph(ctx) {
  const document = buildGraphDocument({ specDir: corpusDir(ctx), rootDir: ctx.root });
  return {
    data: document,
    text: lines([
      `nodes    ${document.nodes.length}`,
      `edges    ${document.edges.length}`,
      `orphans  ${document.orphans.length}`,
      `stale    ${document.stale.length}`,
    ]),
  };
}

export function flagStates(ctx) {
  const data = {
    workspace: workspaceEnabled({ rootDir: ctx.root }),
    annotations: annotationsEnabled({ rootDir: ctx.root }),
    architecture_map: architectureMapEnabled({ rootDir: ctx.root }),
  };
  return { data, text: lines(Object.entries(data).map(([key, value]) => `${key}: ${value}`)) };
}

// ─── the dispatcher sweep: seven more subcommands ───
//
// Three of these WRITE, which is new for this file: the nine above it are all
// reads. The writer contract (spec dispatcher-sweep, W-1..W-5) is applied here
// rather than inside each Domain function because two of the three already gate
// themselves and one does not, and a CLI whose behavior depends on which of those
// you happened to call is not a contract. Deciding it once at the boundary is what
// makes `delta`, `digest` and `shards` answer identically.

// W-2. Returned as a RESULT rather than thrown: an un-opted-in project is not an
// error, it is a project that has not turned the corpus on, and exit 1 there would
// make every consumer install look broken. It says so in words because a silent
// exit 0 is indistinguishable from a successful write.
function writeGate(ctx, command) {
  if (architectureMapEnabled({ rootDir: ctx.root })) return null;
  const data = { written: false, reason: 'memory.architecture_map.enabled is not true' };
  return { data, text: lines([`${command}: written=false — the architecture map is not enabled for this project`]) };
}

// W-4. `--confirm` is refused rather than ignored. Ignoring it would let a caller
// believe they had confirmed something; the propose/confirm split exists because
// the confirming half is a main-context decision (Article II), and a flag is not a
// human.
function refuseConfirm(flags, command) {
  if (flags.confirm !== undefined) {
    throw new UsageError(`${command} exposes the propose half only — confirmation is a main-context decision, not a flag`);
  }
}

// Both forms parse because the SOP and the signature each teach one of them.
// archive/SKILL.md Step 3 gave the comma signature and then instructed a quoted
// JSON array in bold; the array split on its own inner commas and yielded quoted
// garbage paths, which scored confirmed 0 / drift 6 while `inputEmpty` stayed
// false. Accepting both is cheaper than making a reader pick the right one, and
// the bold line's zsh word-splitting hazard is real.
export function parseTouchedPaths(raw) {
  if (raw === undefined || raw === true || raw === null) return [];
  const text = String(raw).trim();
  if (!text) return [];
  return (jsonArrayOrNull(text) ?? text.split(','))
    .map((p) => String(p).trim())
    .filter(Boolean)
    .map((p) => assertNoTraversal(p));
}

function jsonArrayOrNull(text) {
  if (!text.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function touchedPaths(flags) {
  return parseTouchedPaths(flags.touched);
}

function memoryDir(ctx) {
  const given = ctx.flags['mem-dir'];
  if (!given) return join(ctx.root, '.claude/memory');
  if (isAbsolute(given)) return given;
  assertNoTraversal(given);
  return join(ctx.root, given);
}

export function delta(ctx) {
  refuseBulk(ctx.flags, ctx.positional, { max: 0 });
  const slug = requireValue(ctx.flags, 'slug');
  assertSafeSlug(slug, 'delta workflow slug');
  const blocked = writeGate(ctx, 'delta');
  if (blocked) return blocked;

  const result = verifyAndApplyDelta({
    slug, specDir: corpusDir(ctx), rootDir: ctx.root, touchedPaths: touchedPaths(ctx.flags),
  });
  // Reported as three partitions, not one count. applyDelta deliberately separates
  // them — a glob-anchored element is applied AND skipped for digest, and folding
  // that into a single number is the overstatement backlog
  // `syncback-applied-overstates-what-it-stamped-8e21` measured at 2.7x. A front
  // door that re-collapsed them would reintroduce it at the CLI.
  const { applied = [], shardsWritten = [], skippedGlob = [] } = result;
  return {
    data: { ...result, written: applied.length > 0 },
    text: lines(applied.length
      ? [
        ...applied.map((id) => `applied      ${id}`),
        ...shardsWritten.map((path) => `shard        ${path}`),
        ...skippedGlob.map((id) => `no digest    ${id} (glob-anchored)`),
      ]
      : ['(no delta row applied)']),
  };
}

export function digest(ctx) {
  refuseBulk(ctx.flags, ctx.positional);
  const id = elementId(ctx.positional[0]);
  const blocked = writeGate(ctx, 'digest');
  if (blocked) return blocked;

  const result = stampElement(corpusDir(ctx), id, { rootDir: ctx.root });
  if (result.state === 'unknown') throw new NotFoundError(`no element \`${id}\` in the corpus`);
  return {
    data: { ...result, written: result.state === 'fresh' },
    text: lines([`${result.id}: ${result.state}${result.digest ? `  ${result.digest}` : ''}`]),
  };
}

export function shards(ctx) {
  refuseBulk(ctx.flags, ctx.positional);
  const id = elementId(ctx.positional[0]);
  const kind = requireValue(ctx.flags, 'kind');
  const blocked = writeGate(ctx, 'shards');
  if (blocked) return blocked;

  const label = ctx.flags.label === true ? undefined : ctx.flags.label;
  const result = writeDiagramShard(corpusDir(ctx), id, { kind, label, rootDir: ctx.root });
  return { data: result, text: lines([`${result.written ? 'wrote' : 'skipped'} ${result.path ?? id}`]) };
}

// The exit status IS the verdict, which is why this returns `exitCode` rather than
// throwing: a corpus carrying damage nobody can repair is a successful run
// reporting bad news, not an error. `dispatch` honours the field and still prints
// the body, so the operator gets the file list either way.
//
// Reported as three partitions for the same reason `delta` is: git-restored is
// lossless, record-restored recovers a label and a title but leaves `techn` at the
// kind, and unrestorable changed nothing. Collapsing them into one count would
// claim a fidelity two thirds of the rows do not have.
export function restoreShards(ctx) {
  refuseBulk(ctx.flags, ctx.positional, { max: 0 });
  const blocked = writeGate(ctx, 'restore-shards');
  if (blocked) return blocked;

  const dryRun = ctx.flags['dry-run'] !== undefined;
  const report = restoreDegradedShards({ rootDir: ctx.root, specDir: corpusDir(ctx), dryRun });
  const { restored, recordRestored, unrestorable } = report;
  const verb = dryRun ? 'would restore' : 'restored';
  const rows = [
    ...restored.map((r) => `${verb}    ${r.path}  (git ${r.sha.slice(0, 8)})`),
    ...recordRestored.map((r) => `${verb}    ${r.path}  (element record)`),
    ...unrestorable.map((path) => `unrestorable ${path}`),
  ];
  return {
    data: { ...report, dryRun, written: !dryRun && restored.length + recordRestored.length > 0 },
    text: lines(rows.length ? rows : ['no degraded shards']),
    exitCode: unrestorable.length > 0 ? EXIT_NOT_FOUND : EXIT_OK,
  };
}

export function placement(ctx) {
  refuseConfirm(ctx.flags, 'placement');
  const key = ctx.positional[0];
  if (!key) throw new UsageError('placement requires a memory entry key');
  assertSafeSlug(key, 'memory entry key');
  const allowed = annotationPlacementAllowed(memoryDir(ctx), key);
  return { data: { key, load_bearing: allowed }, text: lines([`${key}: ${allowed}`]) };
}

export function reconcile(ctx) {
  const report = reconcileCorpus({ specDir: corpusDir(ctx), touchedPaths: touchedPaths(ctx.flags) });
  const counts = Object.entries(report).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.length : value}`);
  return { data: report, text: lines(counts.length ? counts : ['(nothing to reconcile)']) };
}

export function annotations(ctx) {
  const found = scanAnnotations({ rootDir: ctx.root });
  const rows = Array.isArray(found) ? found : Object.entries(found).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : v}`);
  return {
    data: found,
    text: lines(rows.length ? rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))) : ['(no annotations)']),
  };
}

export function sync(ctx) {
  refuseConfirm(ctx.flags, 'sync');
  const proposed = proposeMap({ rootDir: ctx.root });
  return {
    data: proposed,
    text: lines(proposed.concepts.map((c) => `${c.id}  ${c.anchors.length} anchor(s)  ${c.title}`)),
  };
}
