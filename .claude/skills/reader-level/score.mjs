#!/usr/bin/env node
// reader-level score — how hard is this page to read, and which sentences make
// it hard.
//
// Written after a docs page shipped at postgraduate reading level. The prose
// was accurate and passed every style check; it was simply built out of long
// sentences and Latinate abstractions, which no AI-pattern rule detects.
//
// Usage:  node .claude/skills/reader-level/score.mjs <file> [<file>...]
//         node .claude/skills/reader-level/score.mjs --target 10 <file>
//
// Exit 0 when every file meets the grade target, 1 otherwise, 2 on bad usage.
//
// WHAT IS MEASURED, AND WHAT IS NOT. Code spans, headings and quoted excerpts
// are stripped before scoring. `.claude/state/spec_approvals/<epic>.approval`
// is not prose and would wreck a syllable count; a skill description quoted
// from SKILL.md belongs to its source. Only the prose an author wrote here is
// scored, which is the only prose an author can fix.

import { readFileSync, existsSync } from 'node:fs';

const DEFAULT_TARGET = 9;  // US grade. Research band for professional readers is
                           // 9-11; the low end, because this prose already spends
                           // its budget on unavoidable identifiers.

// ------------------------------------------------------------------ extraction

function scopeToArticle(src) {
  const m = /<article\b[^>]*class="[^"]*docs-main[^"]*"[^>]*>([\s\S]*?)<\/article>/.exec(src);
  return m ? m[1] : src;
}

// Prose paragraphs only. Excerpts are quoted from elsewhere; headings are
// labels, not sentences, and would skew the average sentence length down.
function prose(src) {
  const out = [];
  for (const m of src.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    if (/\bclass="[^"]*\b(excerpt|cell-note|step-note)\b/.test(m[1])) continue;
    const codeSpans = (m[2].match(/<code\b/g) || []).length;
    const text = m[2]
      // A code span is an identifier, not words. Replace with a neutral token
      // so sentence structure survives but syllables are not counted. The count
      // is kept: identifiers are part of the reader's load even though they are
      // not part of the syllable maths.
      .replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, ' CODE ')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) out.push({ text, codeSpans });
  }
  return out;
}

const ABBREV_END = /\b(?:[A-Z][a-z]{0,3}|[A-Z]|e\.g|i\.e|vs|etc|cf|no)\.$/;

function splitSentences(text) {
  const parts = String(text).split(/(?<=[.!?])\s+/);
  const out = [];
  for (const p of parts) {
    if (out.length && ABBREV_END.test(out[out.length - 1])) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

const words = (s) => s.split(/\s+/).filter((w) => /[a-z]/i.test(w));

// Syllable estimate. Exact counting needs a dictionary; this is the standard
// vowel-group heuristic, which is what readability tools use in practice and
// is accurate enough for a page-level average.
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

// ---------------------------------------------------------------- word lists

// Latinate abstractions with a plain equivalent. Every pair below is a word
// that costs the reader a beat for no added precision in this register.
const PLAINER = {
  amortize: 'spread the cost of', amortizes: 'spreads the cost of',
  decompose: 'split', decomposes: 'splits', decomposed: 'split',
  utilize: 'use', utilizes: 'uses', utilise: 'use',
  facilitate: 'help', facilitates: 'helps',
  demonstrate: 'show', demonstrates: 'shows',
  additional: 'more', additionally: 'also',
  approximately: 'about', numerous: 'many', sufficient: 'enough',
  subsequently: 'later', subsequent: 'next', previously: 'before',
  commence: 'start', commences: 'starts', terminate: 'end', terminates: 'ends',
  obtain: 'get', obtains: 'gets', require: 'need', requires: 'needs',
  attempt: 'try', attempts: 'tries', assist: 'help', assists: 'helps',
  provide: 'give', provides: 'gives', permit: 'let', permits: 'lets',
  purchase: 'buy', initiate: 'start', initiates: 'starts',
  ascertain: 'find out', endeavour: 'try', endeavor: 'try',
  regarding: 'about', concerning: 'about', pertaining: 'about',
  prior: 'before', accordingly: 'so', consequently: 'so', therefore: 'so',
  however: 'but', nevertheless: 'but', furthermore: 'also', moreover: 'also',
  encompass: 'cover', encompasses: 'covers',
  constitute: 'make up', constitutes: 'makes up',
  necessitate: 'need', necessitates: 'needs',
  leverage: 'use', leverages: 'uses',
  methodology: 'method', functionality: 'features',
  optimal: 'best', optimum: 'best', mandatory: 'required',
  aforementioned: 'this', notwithstanding: 'despite',
  in_order_to: 'to',
};

// Zombie nouns. A verb wearing a noun suffix costs the reader the work of
// unpacking it back into an action.
const NOMINALIZATION = /\b\w{4,}(?:tion|ment|ance|ence|ity|ness|ism)s?\b/gi;

// WHY FLESCH-KINCAID IS NOT ENOUGH.
//
// FK is average sentence length and average syllables per word. Nothing else.
// A page of twelve-word sentences built from abstractions and identifiers
// scores as middle-school reading and is still hard, because the reader's cost
// is carrying unfamiliar concepts, not counting syllables. The three measures
// below cover what FK is blind to, and the target has to be met on all four.

// Long words that are nonetheless everyday. Dale-Chall does this properly with
// a 3,000-word list; this allowlist is the practical subset that keeps ordinary
// prose from reading as difficult.
const COMMON_LONG = new Set([
  'everything', 'something', 'anything', 'nothing', 'everyone', 'anyone',
  'already', 'another', 'because', 'before', 'between', 'different',
  'difficult', 'example', 'important', 'together', 'without', 'against',
  'however', 'never', 'often', 'other', 'over', 'under', 'until', 'while',
  'about', 'after', 'again', 'every', 'first', 'following', 'family',
  'remember', 'understand', 'probably', 'usually', 'happen', 'happens',
  'behaviour', 'behavior', 'anywhere', 'everywhere', 'somewhere',
]);

// Subordination markers. Each one asks the reader to hold the first half of the
// sentence in mind while they read the second.
const CLAUSE_MARKERS = /\b(which|whereas|although|whilst|while|unless|until|because|since|whether|wherever|whenever|so that|such that|given that|in which|by which|for which|rather than|as long as)\b/gi;

// Vague nouns. Reaching for a simpler word, a writer often picks a more general
// one — and generality costs the reader the work of guessing what was meant.
// "An epic splits into pieces" is worse than "an epic splits into tasks", which
// is shorter, commoner AND correct. Reported for review rather than failed: any
// of these can be the right word when the thing genuinely has no name.
const VAGUE_NOUNS = /\b(pieces?|parts?|things?|items?|elements?|aspects?|areas?|entit(?:y|ies)|stuff)\b/gi;

function vagueNouns(paragraphs) {
  const hits = [];
  for (const p of paragraphs) {
    for (const m of p.text.matchAll(VAGUE_NOUNS)) hits.push(m[0].toLowerCase());
  }
  return hits;
}

// A token carrying a dot, slash or underscore is a path or an identifier, not a
// word the reader has to know. Counting "settings.json" as the three-syllable
// word "settingsjson" reported vocabulary difficulty that does not exist.
const IDENTIFIER = /[./_]|^[A-Z]{2,}$/;

function hardWords(allWords) {
  const hard = [];
  for (const raw of allWords) {
    if (IDENTIFIER.test(raw)) continue;
    const w = raw.toLowerCase().replace(/[^a-z-]/g, '');
    if (w.length < 4 || w === 'code') continue;
    if (COMMON_LONG.has(w) || DOMAIN_TERMS.has(w)) continue;
    if (syllables(w) >= 3) hard.push(w);
  }
  return hard;
}

// Real terminology this project cannot rewrite away. Counted for the record but
// not reported as a fixable word.
const DOMAIN_TERMS = new Set([
  'documentation', 'implementation', 'configuration', 'permission', 'permissions',
  'session', 'sessions', 'version', 'versions', 'directory', 'repository',
  'dependency', 'dependencies', 'assertion', 'assertions', 'invariant',
  'invariants', 'validation', 'authentication', 'instrumentation',
]);

// ------------------------------------------------------------------- scoring

function scoreFile(path, target) {
  const src = scopeToArticle(readFileSync(path, 'utf8'));
  const paragraphs = prose(src);
  const sentences = paragraphs.flatMap((p) => splitSentences(p.text)).filter((s) => words(s).length >= 3);
  const codeSpanTotal = paragraphs.reduce((n, p) => n + p.codeSpans, 0);

  if (sentences.length === 0) {
    return { path, empty: true };
  }

  const allWords = sentences.flatMap(words);
  const totalSyllables = allWords.reduce((n, w) => n + syllables(w), 0);
  const wps = allWords.length / sentences.length;
  const spw = totalSyllables / allWords.length;

  const grade = 0.39 * wps + 11.8 * spw - 15.59;
  const ease = 206.835 - 1.015 * wps - 84.6 * spw;

  const long = sentences
    .map((s) => ({ s, n: words(s).length }))
    .filter((x) => x.n > 25)
    .sort((a, b) => b.n - a.n);

  const plainHits = [];
  for (const w of allWords) {
    const k = w.toLowerCase().replace(/[^a-z]/g, '');
    if (PLAINER[k]) plainHits.push({ word: k, better: PLAINER[k] });
  }

  const zombies = [];
  for (const p of paragraphs) {
    for (const m of p.text.matchAll(NOMINALIZATION)) {
      const w = m[0].toLowerCase();
      if (!DOMAIN_TERMS.has(w)) zombies.push(w);
    }
  }

  // Passive voice: a "to be" form followed by a past participle. Deliberately
  // conservative; passive is right sometimes, so this is reported, never failed.
  const passive = sentences.filter((s) =>
    /\b(is|are|was|were|be|been|being)\s+(\w+ed|written|built|held|read|kept|shown|given|taken|made|run|set|put|sent|drawn)\b/i.test(s),
  );

  const hard = hardWords(allWords);
  const vague = vagueNouns(paragraphs);
  const hardPct = (hard.length / allWords.length) * 100;
  const clauseMarkers = sentences.reduce(
    (n, s) => n + (s.match(CLAUSE_MARKERS) || []).length, 0,
  );
  const clausesPerSentence = clauseMarkers / sentences.length;
  const jargonPerSentence = codeSpanTotal / sentences.length;

  // All four must pass. Any one of them alone is gameable.
  const checks = [
    { id: 'grade', value: grade, limit: target, unit: '' },
    { id: 'hard words', value: hardPct, limit: 10, unit: '%' },
    { id: 'clause load', value: clausesPerSentence, limit: 0.4, unit: '/sentence' },
    { id: 'jargon load', value: jargonPerSentence, limit: 1.2, unit: '/sentence' },
  ];
  const failedChecks = checks.filter((c) => c.value > c.limit);

  return {
    path,
    grade,
    ease,
    hard,
    hardPct,
    vague: [...new Set(vague)],
    vagueCount: vague.length,
    clausesPerSentence,
    jargonPerSentence,
    checks,
    failedChecks,
    sentences: sentences.length,
    words: allWords.length,
    wordsPerSentence: wps,
    syllablesPerWord: spw,
    longSentences: long,
    plainHits,
    zombies: [...new Set(zombies)],
    passiveCount: passive.length,
    passivePct: Math.round((passive.length / sentences.length) * 100),
    meetsTarget: failedChecks.length === 0,
  };
}

// --------------------------------------------------------------------- report

function report(r, target) {
  if (r.empty) {
    process.stdout.write(`\n${r.path}\n  no prose paragraphs found\n`);
    return 0;
  }
  const mark = r.meetsTarget ? 'ok' : 'OVER';
  process.stdout.write(`\n${r.path}\n`);
  process.stdout.write(`  ${mark}  ${r.sentences} sentences, ${r.wordsPerSentence.toFixed(1)} words each\n`);
  for (const c of r.checks) {
    const over = c.value > c.limit;
    process.stdout.write(
      `    ${over ? '✗' : '·'} ${c.id.padEnd(12)} ${c.value.toFixed(1)}${c.unit}` +
      ` (limit ${c.limit}${c.unit})\n`,
    );
  }
  if (r.hardPct > 10) {
    process.stdout.write(`    hardest words: ${[...new Set(r.hard)].slice(0, 14).join(', ')}\n`);
  }

  if (r.longSentences.length) {
    process.stdout.write(`  ${r.longSentences.length} sentence(s) over 25 words:\n`);
    for (const x of r.longSentences.slice(0, 5)) {
      process.stdout.write(`    ${x.n}w  ${x.s.slice(0, 96)}${x.s.length > 96 ? '…' : ''}\n`);
    }
  }
  if (r.plainHits.length) {
    const uniq = [...new Map(r.plainHits.map((h) => [h.word, h.better])).entries()];
    process.stdout.write(`  ${r.plainHits.length} word(s) with a plainer form:\n`);
    process.stdout.write(`    ${uniq.map(([w, b]) => `${w} → ${b}`).join(' · ')}\n`);
  }
  if (r.vagueCount) {
    process.stdout.write(
      `  ${r.vagueCount} vague noun(s): ${r.vague.join(', ')}` +
      ` — check whether the product already has a name for it\n`,
    );
  }
  if (r.zombies.length) {
    process.stdout.write(`  ${r.zombies.length} abstract noun(s): ${r.zombies.slice(0, 12).join(', ')}\n`);
  }
  if (r.passivePct > 20) {
    process.stdout.write(`  passive voice in ${r.passivePct}% of sentences (${r.passiveCount})\n`);
  }
  return r.meetsTarget ? 0 : 1;
}

function main(argv) {
  const args = argv.slice(2);
  let target = DEFAULT_TARGET;
  const files = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--target') { target = Number(args[i + 1]); i += 1; continue; }
    files.push(args[i]);
  }
  if (!files.length || Number.isNaN(target)) {
    process.stderr.write('usage: score.mjs [--target <grade>] <file>...\n');
    return 2;
  }
  let failed = 0;
  for (const f of files) {
    if (!existsSync(f)) { process.stderr.write(`not found: ${f}\n`); return 2; }
    failed += report(scoreFile(f, target), target);
  }
  process.stdout.write(
    failed > 0 ? `\n${failed} file(s) above grade ${target}\n` : `\nall files at or below grade ${target}\n`,
  );
  return failed > 0 ? 1 : 0;
}

process.exit(main(process.argv));
