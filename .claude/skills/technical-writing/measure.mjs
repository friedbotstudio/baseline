#!/usr/bin/env node
// Measure a documentation draft against the profile of professionally-written
// technical documentation, and report every axis that falls outside it.
//
// The bands in corpus-bands.json were derived from 113,887 words of prose across
// 28 documentation pages published before 2022 (SQLite, PostgreSQL 12, Python 3.8,
// Django 3.2, the Rust book, Effective Go, Pro Git, nginx, Backbone, 12factor,
// Redis). See references/corpus-profile.md for the full derivation.
//
//   node measure.mjs --type reference path/to/page.html
//   node measure.mjs --type tutorial --json draft.md
//
// Exit 0 when every axis is inside its band, 1 when any axis is outside,
// 2 on a usage or IO error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TYPES = ['reference', 'explanation', 'tutorial', 'howto'];

// ─── text primitives ────────────────────────────────────────────────────────

const ENTS = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', sect: '§', middot: '·',
  bull: '•', times: '×', deg: '°', copy: '©', larr: '←', rarr: '→', para: '¶',
};

function decode(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENTS ? ENTS[n] : m));
}

const squash = (s) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const ABBR = /\b(e\.g|i\.e|etc|vs|cf|approx|Mr|Mrs|Ms|Dr|Prof|St|No|Fig|Ch|Sec|Inc|Ltd|al|Jr|Sr|U\.S|a\.m|p\.m)\.$/i;

export function sentences(text) {
  const parts = String(text).split(/(?<=[.!?])["')\]]*\s+/);
  const out = [];
  let buf = '';
  for (const p of parts) {
    buf = buf ? `${buf} ${p}` : p;
    const t = buf.trim();
    // An abbreviation, an initial or a decimal is not a sentence boundary.
    if (ABBR.test(t) || /\b[A-Z]\.$/.test(t) || /\d\.$/.test(t)) continue;
    if (t) out.push(t);
    buf = '';
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => /[a-zA-Z]/.test(s) && s.split(/\s+/).length >= 2);
}

const wc = (s) => (s.match(/\S+/g) || []).length;
const lexicon = (s) => s.toLowerCase().match(/[a-z][a-z'’-]*/g) || [];

function syllables(w) {
  const t = w.toLowerCase().replace(/[^a-z]/g, '');
  if (t.length <= 3) return 1;
  const s = t.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return (s.match(/[aeiouy]{1,2}/g) || ['x']).length;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pctl = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.max(0, Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1))))];
};
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

// ─── source parsing ─────────────────────────────────────────────────────────

const NOISE = [
  /^(Note|Warning|See also|Table of Contents|Contents|Index)[:.]?$/i,
  /©|all rights reserved/i,
  /^(Submit|Search|Toggle|Expand|Collapse|Skip to)\b/i,
];
const isNoise = (t) => t.length < 25 || NOISE.some((r) => r.test(t));

// Remove every <div class="…cell…"> region, tracking div nesting so the scan
// closes on the right tag rather than the first </div> it meets.
function stripCells(html) {
  const open = /<div\b[^>]*class="[^"]*\b(?:cell|card|tile|stat)\b[^"]*"[^>]*>/gi;
  const out = [];
  let cursor = 0;
  let removed = 0;
  let m;
  while ((m = open.exec(html)) !== null) {
    if (m.index < cursor) continue;
    out.push(html.slice(cursor, m.index));
    let depth = 1;
    const tag = /<\/?div\b[^>]*>/gi;
    tag.lastIndex = m.index + m[0].length;
    let t;
    while (depth > 0 && (t = tag.exec(html)) !== null) {
      depth += t[0].startsWith('</') ? -1 : 1;
    }
    // An unbalanced document ends the region at the end of the input.
    cursor = depth === 0 && t ? tag.lastIndex : html.length;
    open.lastIndex = cursor;
    removed += 1;
  }
  out.push(html.slice(cursor));
  return { body: out.join(' '), removed };
}

function parseHtml(html) {
  let h = html;
  for (const tag of ['script', 'style', 'svg', 'noscript', 'nav', 'footer', 'header',
    'aside', 'form', 'select', 'iframe', 'template', 'button']) {
    h = h.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), ' ');
  }

  const code = [];
  let m;
  const pre = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
  while ((m = pre.exec(h)) !== null) code.push(decode(m[1].replace(/<[^>]*>/g, '')).trim());

  const headings = [];
  const hre = /<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  while ((m = hre.exec(h)) !== null) {
    const t = squash(m[2]).replace(/[¶§]\s*$/, '').trim();
    if (t && t.length < 120) headings.push({ level: Number(m[1]), text: t });
  }

  const noPre = h.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, ' ');

  // A card or grid cell is a table cell wearing a <p>. Its content is a label or
  // a fragment by design, so measuring it as body prose punishes correct markup.
  // Lift those regions out and count them as enumerated items instead.
  const { body: proseHtml, removed: cellCount } = stripCells(noPre);

  let inlineCode = 0;
  const paragraphs = [];
  const pre2 = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  while ((m = pre2.exec(proseHtml)) !== null) {
    if (/class="[^"]*\b(excerpt|cell-note|cell-kicker|caption|kicker|label|meta|eyebrow)\b/i.test(m[1])) continue;
    // An identifier styled with a class is still an identifier, so count the
    // common monospace-span idiom alongside the real inline-code elements.
    const MONO_SPAN = /<span\b[^>]*class="[^"]*\b(mono|mono-em|tok|code|kbd)\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi;
    inlineCode += (m[2].match(/<(code|tt|kbd|samp|var)\b/gi) || []).length
      + (m[2].match(MONO_SPAN) || []).length;
    const t = squash(m[2]
      .replace(MONO_SPAN, ' CODETOKEN ')
      .replace(/<(code|tt|kbd|samp|var)\b[^>]*>[\s\S]*?<\/\1>/gi, ' CODETOKEN '));
    if (!isNoise(t)) paragraphs.push(t);
  }

  // Anything the reader perceives as an enumerated item, however it is marked up.
  const items = (noPre.match(/<li\b/gi) || []).length
    + (noPre.match(/<dt\b/gi) || []).length
    + cellCount
    + (noPre.match(/<tr\b/gi) || []).length;

  return { paragraphs, headings, code, inlineCode, items };
}

function parseMarkdown(md) {
  const code = [];
  const body = md.replace(/^```[\s\S]*?^```/gm, (b) => {
    code.push(b);
    return '\n\n';
  });
  const headings = [];
  for (const line of body.split('\n')) {
    const h = /^(#{2,6})\s+(.*)$/.exec(line);
    if (h) headings.push({ level: h[1].length, text: h[2].replace(/[`*_]/g, '').trim() });
  }
  const noHead = body.replace(/^#{1,6}\s+.*$/gm, '');
  // Front matter is metadata, not prose.
  const noFm = noHead.replace(/^---\n[\s\S]*?\n---\n/, '');
  const items = (noFm.match(/^\s*([-*+]|\d+\.)\s+\S/gm) || []).length
    + (noFm.match(/^\s*\|/gm) || []).length;
  const withoutLists = noFm.replace(/^\s*([-*+]|\d+\.)\s+.*$/gm, '').replace(/^\s*\|.*$/gm, '');
  let inlineCode = 0;
  const paragraphs = withoutLists
    .split(/\n\s*\n/)
    .map((p) => {
      inlineCode += (p.match(/`[^`\n]+`/g) || []).length;
      return p.replace(/`[^`\n]+`/g, ' CODETOKEN ').replace(/[*_>]/g, '').replace(/\s+/g, ' ').trim();
    })
    .filter((p) => p && !isNoise(p));
  return { paragraphs, headings, code, inlineCode, items };
}

export function parseSource(text, ext) {
  const looksHtml = /<(p|div|section|h[1-6]|ul|table)\b/i.test(text);
  if (ext === '.html' || ext === '.htm' || ext === '.njk' || looksHtml) return parseHtml(text);
  return parseMarkdown(text);
}

// ─── lexicons ───────────────────────────────────────────────────────────────

const MODALS = ['can', 'may', 'must', 'should', 'will', 'might', 'could', 'would', 'shall', 'cannot'];
const SUBORD = ['because', 'although', 'though', 'while', 'whereas', 'unless', 'until', 'since',
  'if', 'when', 'after', 'before', 'once', 'whether'];
const HEDGES = ['generally', 'typically', 'usually', 'often', 'sometimes', 'somewhat', 'relatively',
  'fairly', 'rather', 'perhaps', 'possibly', 'probably', 'arguably', 'largely', 'mostly'];
const AI_VOCAB = ['delve', 'landscape', 'realm', 'paradigm', 'embark', 'testament', 'cutting-edge',
  'pivotal', 'underscores', 'underscore', 'meticulous', 'game-changer', 'nestled', 'intricate',
  'ever-evolving', 'holistic', 'actionable', 'impactful', 'learnings', 'synergy', 'unlock',
  'unleash', 'empower', 'elevate', 'foster', 'resonate', 'multifaceted', 'myriad', 'plethora',
  'cornerstone', 'paramount', 'overarching', 'nuanced', 'vibrant', 'bustling', 'tapestry'];
const TRANSITIONS = ['moreover', 'furthermore', 'additionally', 'notably', 'importantly',
  'consequently', 'nevertheless', 'nonetheless', 'ultimately', 'essentially', 'basically'];

const PASSIVE = /\b(is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?\w+(?:ed|en|wn|ne)\b/gi;
const NEGATION_DEF = /\b\w+, not \w+|\bnot\s+\w+[^.]{0,30}\bbut\s+\w+|\brather than\b|\binstead of\b|\bit'?s not\b[^.]{0,40}\bit'?s\b/gi;
const RULE_OF_THREE = /\b\w+,\s+\w+,\s+and\s+\w+\b/g;
const HEAD_NEGATION = /\b\w+,\s*not\s+\w+|\bnot\s+\w+.{0,25}\bbut\b|\brather than\b|\binstead of\b|^(no|never|not)\b/i;

// ─── paragraph opening moves ────────────────────────────────────────────────
// The single strongest monotony signal: real documentation varies the rhetorical
// move a paragraph opens with. Generated prose asserts, over and over.

export function openingMove(s) {
  const t = String(s).trim();
  if (/^(if|when|unless|once|whenever|where|assuming|suppose|given|provided)\b/i.test(t)) return 'condition';
  if (/^(to|in order to|for)\b[^.]{0,60},/i.test(t)) return 'purpose';
  if (/^(the|a|an|this|these|those|each|every|any)\b[^.]{0,50}\b(is|are|was|were|means|refers|denotes|consists|contains|holds|represents)\b/i.test(t)) return 'definition';
  if (/^(note|warning|caution|see|for (more|details)|by default)\b/i.test(t)) return 'aside';
  if (/^(you|your)\b/i.test(t)) return 'address-reader';
  if (/^(we|our|let'?s|i)\b/i.test(t)) return 'authorial';
  if (/^(however|but|although|though|while|whereas|instead|conversely|on the other hand)\b/i.test(t)) return 'contrast';
  if (/^(add|install|run|create|write|use|set|configure|open|edit|start|make|change|copy|type|enter|save|call|try|check|replace|remove|put|pick|choose)\b/i.test(t)) return 'directive';
  if (/^there (is|are|was|were)\b/i.test(t)) return 'existential';
  return 'assertion';
}

// ─── heading grammar ────────────────────────────────────────────────────────

const IMPERATIVE_HINTS = new Set(['add', 'install', 'run', 'create', 'write', 'use', 'set',
  'configure', 'build', 'make', 'define', 'start', 'stop', 'open', 'change', 'update', 'remove',
  'delete', 'check', 'verify', 'deploy', 'generate', 'store', 'handle', 'connect', 'enable',
  'disable', 'import', 'export', 'send', 'load', 'save', 'test', 'try', 'view', 'edit', 'copy',
  'move', 'read', 'print', 'call', 'pass', 'keep', 'avoid', 'choose', 'pick', 'apply', 'push',
  'pull', 'commit', 'clone', 'merge', 'switch', 'compare', 'allow', 'take', 'get', 'put']);
const FINITE_VERB = /\b(is|are|was|were|has|have|had|can|cannot|can't|could|may|might|must|should|will|would|does|do|did|works|runs|makes|takes|gives|returns|means|becomes|provides|uses|contains|requires|allows|lets|needs)\b/i;
const AUX = /^(is|are|was|were|be|been|being|has|have|had|can|could|may|might|must|shall|should|will|would|do|does|did)$/;

export function classifyHeading(text) {
  const t = String(text).trim().replace(/[.:]$/, '');
  const w = t.split(/\s+/);
  const first = (w[0] || '').toLowerCase().replace(/[^a-z']/g, '');
  if (/\?$/.test(t) || /^(how|what|why|when|where|which|who)\b/i.test(t)) return 'question';
  if (/^\w+ing\b/i.test(t) && !AUX.test(first)) return 'gerund';
  // Many imperative verbs double as nouns modifying another noun ("Merge
  // semantics", "Set operations", "Commit consent"). Treat the heading as a
  // directive only when it reads as a clause: a determiner or possessive
  // somewhere, or enough words to carry an object.
  if (IMPERATIVE_HINTS.has(first)
    && (/\b(the|a|an|your|our|its|their|this|these|those|each|all|every)\b/i.test(t) || w.length >= 3)) {
    return 'imperative';
  }
  if (FINITE_VERB.test(t) && w.length >= 3) return 'sentence';
  return 'noun-phrase';
}

// ─── metrics ────────────────────────────────────────────────────────────────

export function measure(parsed) {
  const { paragraphs, headings, code, inlineCode, items } = parsed;
  const prose = paragraphs.join(' ');
  const W = lexicon(prose);
  const n = W.length;
  if (n < 120) {
    throw new Error(`only ${n} words of body prose found — too little to measure (need 120+). ` +
      'Check that the file is a rendered page, not a template shell.');
  }

  const sentLens = [];
  const deltas = [];
  const moves = Object.create(null);
  const paraWords = [];
  const paraSents = [];
  let passive = 0;

  for (const p of paragraphs) {
    const ss = sentences(p);
    if (!ss.length) continue;
    const mv = openingMove(ss[0]);
    moves[mv] = (moves[mv] || 0) + 1;
    paraSents.push(ss.length);
    paraWords.push(wc(p));
    const L = [];
    for (const s of ss) {
      const k = wc(s);
      if (k >= 2 && k <= 150) L.push(k);
      if (PASSIVE.test(s)) passive++;
      PASSIVE.lastIndex = 0;
    }
    for (let i = 1; i < L.length; i++) deltas.push(Math.abs(L[i] - L[i - 1]));
    sentLens.push(...L);
  }

  const nSent = sentLens.length || 1;
  const count = (list) => W.reduce((a, w) => a + (list.includes(w) ? 1 : 0), 0);
  const hits = (re) => (prose.match(re) || []).length;
  const per1k = (x) => r1((x / n) * 1000);
  const syl = W.reduce((a, w) => a + syllables(w), 0);

  const movesTotal = Object.values(moves).reduce((a, b) => a + b, 0) || 1;
  const movePct = Object.fromEntries(
    Object.entries(moves).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r1((v / movesTotal) * 100)]),
  );

  const headClasses = Object.create(null);
  for (const h of headings) {
    const c = classifyHeading(h.text);
    headClasses[c] = (headClasses[c] || 0) + 1;
  }

  return {
    proseWords: n,
    sentences: nSent,
    paragraphs: paragraphs.length,

    sentMean: r1(mean(sentLens)),
    sentP90: pctl(sentLens, 90),
    pctLongSent: r1((sentLens.filter((x) => x >= 30).length / nSent) * 100),
    pctShortSent: r1((sentLens.filter((x) => x <= 10).length / nSent) * 100),
    adjacentDelta: r1(mean(deltas)),

    paraWordMean: r1(mean(paraWords)),
    pctPara3to5: r1((paraSents.filter((x) => x >= 3 && x <= 5).length / (paraSents.length || 1)) * 100),

    commasPerSent: r2(hits(/,/g) / nSent),
    parensPer1k: per1k(hits(/\(/g)),
    emDashPer1k: per1k(hits(/—|--/g)),
    subordPer1k: per1k(count(SUBORD)),
    passivePctSent: r1((passive / nSent) * 100),

    modalsPer1k: per1k(count(MODALS)),
    hedgePer1k: per1k(count(HEDGES)),
    youPer1k: per1k(count(['you', 'your', 'yours', "you're", "you'll"])),

    aiVocabPer1k: per1k(count(AI_VOCAB)),
    transitionPer1k: per1k(count(TRANSITIONS)),
    negationDefPer1k: per1k(hits(NEGATION_DEF)),
    ruleOfThreePer1k: per1k(hits(RULE_OF_THREE)),

    // Raw occurrence counts behind the suppression rates. On a 300-word page a
    // single instance reads as 3.3 per 1000, so a ceiling cannot be applied to
    // the rate alone without flagging normal prose.
    counts: {
      aiVocabPer1k: count(AI_VOCAB),
      transitionPer1k: count(TRANSITIONS),
      negationDefPer1k: hits(NEGATION_DEF),
      ruleOfThreePer1k: hits(RULE_OF_THREE),
      emDashPer1k: hits(/—|--/g),
    },

    fkGrade: r1(0.39 * (n / nSent) + 11.8 * (syl / n) - 15.59),
    longWordPct: r1((W.filter((w) => syllables(w) >= 3).length / n) * 100),

    openAssertionPct: movePct.assertion || 0,
    openConditionPct: movePct.condition || 0,
    openMoveVariety: Object.keys(moves).length,

    headings: headings.length,
    headWordMean: r1(mean(headings.map((h) => wc(h.text)))),
    // A heading built as a contrast ("X, not Y") appears 0 times in 506 corpus
    // headings. It is a claim wearing a signpost's clothes.
    headNegationCount: headings.filter((h) => HEAD_NEGATION.test(h.text)).length,
    codeBlocksPer1kProse: per1k(code.length),
    inlineCodePerPara: r2(inlineCode / (paragraphs.length || 1)),
    itemsPer1k: per1k(items),

    movePct,
    headClasses,
  };
}

// ─── evaluation ─────────────────────────────────────────────────────────────

export function loadBands() {
  const raw = fs.readFileSync(path.join(HERE, 'corpus-bands.json'), 'utf8');
  return JSON.parse(raw);
}

// Excellent documentation still lands outside a p10/p90 band on two or three
// axes by chance — across 24 axes that is expected, not a defect. So the verdict
// is a weighted deviation score, not an all-axes gate. Each axis contributes
// weight x how far outside its band the value sits, measured in band widths.
// The threshold is calibrated so the corpus passes and generated prose does not.
export function evaluate(m, type, bandFile = loadBands()) {
  if (!TYPES.includes(type)) throw new Error(`unknown type "${type}" (expected ${TYPES.join(', ')})`);
  // A per-type entry overrides individual fields of the shared spec; it does not
  // replace it, so a type that only retunes a bound keeps the shared explanation.
  const overrides = bandFile.byType[type] || {};
  const bands = { ...bandFile.shared };
  for (const [key, spec] of Object.entries(overrides)) bands[key] = { ...bands[key], ...spec };
  const findings = [];
  let score = 0;

  for (const [key, spec] of Object.entries(bands)) {
    const v = m[key];
    if (!Number.isFinite(v)) continue;
    const lo = Number.isFinite(spec.min) ? spec.min : -Infinity;
    const hi = Number.isFinite(spec.max) ? spec.max : Infinity;
    if (v >= lo && v <= hi) continue;

    // A suppression ceiling needs enough raw occurrences to be a pattern rather
    // than one turn of phrase on a short page.
    if (Number.isFinite(spec.minCount) && v > hi) {
      const raw = m.counts?.[key];
      if (Number.isFinite(raw) && raw < spec.minCount) continue;
    }

    // Scale distance by the band width, or for a one-sided band by the gap
    // between the limit and the corpus centre, so every axis is comparable.
    const span = Number.isFinite(lo) && Number.isFinite(hi)
      ? hi - lo
      : Math.abs((spec.corpus ?? (Number.isFinite(lo) ? lo : hi)) - (Number.isFinite(lo) ? lo : hi)) || 1;
    const dir = v < lo ? 'LOW' : 'HIGH';
    const distance = dir === 'LOW' ? lo - v : v - hi;
    const weight = spec.weight ?? 1;
    const contribution = (distance / (span || 1)) * weight;
    score += contribution;
    findings.push({
      key, value: v, lo, hi, dir, weight,
      contribution: Math.round(contribution * 100) / 100,
      why: dir === 'LOW' ? (spec.low ?? spec.why) : (spec.high ?? spec.why),
      corpus: spec.corpus,
    });
  }

  findings.sort((a, b) => b.contribution - a.contribution);
  const threshold = bandFile.threshold ?? 3;
  return {
    score: Math.round(score * 100) / 100,
    threshold,
    pass: score <= threshold,
    findings,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function usage(msg) {
  process.stderr.write(
    `${msg ? `error: ${msg}\n\n` : ''}usage: measure.mjs --type <${TYPES.join('|')}> [--json] <file>\n`,
  );
  process.exit(2);
}

function main(argv) {
  let type = null;
  let json = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') { type = argv[++i]; continue; }
    if (a.startsWith('--type=')) { type = a.slice(7); continue; }
    if (a === '--json') { json = true; continue; }
    if (a === '-h' || a === '--help') usage('');
    if (a.startsWith('-')) usage(`unknown flag ${a}`);
    files.push(a);
  }
  if (!type) usage('--type is required');
  if (!TYPES.includes(type)) usage(`--type must be one of ${TYPES.join(', ')}`);
  if (files.length !== 1) usage('exactly one input file is required');

  const file = files[0];
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    process.stderr.write(`error: cannot read ${file}: ${err.message}\n`);
    process.exit(2);
  }

  let m;
  try {
    m = measure(parseSource(text, path.extname(file).toLowerCase()));
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(2);
  }

  const result = evaluate(m, type);

  if (json) {
    process.stdout.write(`${JSON.stringify({ file, type, metrics: m, ...result }, null, 2)}\n`);
    process.exit(result.pass ? 0 : 1);
  }

  const { findings, score, threshold, pass } = result;
  process.stdout.write(
    `\n  ${path.basename(file)}  ·  ${type}  ·  ${m.proseWords} words, ${m.sentences} sentences\n` +
    `  score ${score}  (threshold ${threshold})  →  ${pass ? 'PASS' : 'FAIL'}\n\n`,
  );
  if (!findings.length) {
    process.stdout.write('  Every axis inside the corpus band.\n\n');
    process.exit(0);
  }
  process.stdout.write(`  ${'axis'.padEnd(22)}${'value'.padStart(8)}${'band'.padStart(13)}${'corpus'.padStart(8)}${'cost'.padStart(7)}\n`);
  process.stdout.write(`  ${'─'.repeat(58)}\n`);
  for (const f of findings) {
    const band = `${Number.isFinite(f.lo) ? f.lo : ''}–${Number.isFinite(f.hi) ? f.hi : ''}`;
    process.stdout.write(
      `  ${f.key.padEnd(22)}${String(f.value).padStart(8)}${band.padStart(13)}` +
      `${String(f.corpus ?? '').padStart(8)}${String(f.contribution).padStart(7)}  ${f.dir}\n`,
    );
    // Only explain the axes actually driving the score.
    if (f.why && f.contribution >= 0.25) process.stdout.write(`      ↳ ${f.why}\n`);
  }
  process.stdout.write(`\n  ${findings.length} axis/axes outside band · score ${score} / ${threshold}\n\n`);
  process.exit(pass ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
