// Eleventy data file — the rosters behind the reference pages.
//
// Reads deriveNames() from the audit's own deriver, the same function
// audit-baseline's docsite drift check reads. A hook, skill, track or MCP
// server added to the repo appears on the rendered page and in the check that
// verifies the page from one edit, and the two cannot disagree about what the
// roster is.
//
// The async-export + pathToFileURL + dynamic import() indirection is mandatory:
// _data/*.cjs is CommonJS and the deriver is ESM. Same shape as baseline.cjs
// and cli.cjs.

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Event wiring lives in settings.json, not in the hook files, so it is read
// here rather than in the deriver: deriveNames answers "which hooks exist",
// this answers "where each one is wired".
//
// A command string is matched on its `<name>.mjs` tail. `notify` is wired on
// three events and lives outside .claude/hooks/, which is why the per-event
// tallies sum above the baseline hook count.
function readHookWiring(repoRoot) {
  const settingsPath = path.join(repoRoot, '.claude/settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const byEvent = new Map();
  const byHook = new Map();

  for (const [event, entries] of Object.entries(settings.hooks || {})) {
    const names = new Set();
    for (const entry of entries) {
      for (const hook of entry.hooks || []) {
        const m = /([a-z_]+)\.mjs/.exec(hook.command || '');
        if (!m) continue;
        names.add(m[1]);
        if (!byHook.has(m[1])) byHook.set(m[1], new Set());
        byHook.get(m[1]).add(event);
      }
    }
    byEvent.set(event, [...names].sort());
  }
  return { byEvent, byHook };
}

// Presentation order for the lifecycle. Declared rather than taken from
// Object.keys(settings.hooks) so a re-ordered settings.json does not silently
// reshuffle the page.
const EVENT_ORDER = [
  'PreToolUse', 'PostToolUse', 'UserPromptSubmit',
  'SessionStart', 'Stop', 'Notification', 'PreCompact',
];

// First sentence only, with a leading "Label — " prefix removed.
//
// Skill descriptions are written for Claude, not for this page, and many open
// with a label the cell already carries as its heading ("Phase 10.5 — move the
// slug's artifacts…"). Dropping the prefix removes duplicated structure; it
// also removes most of the em dashes, which is a consequence rather than the
// reason. Nothing is reworded: the source text is a contract Claude reads and
// is not ours to edit from a template.
function glossOf(description, maxLen = 150) {
  const flat = String(description || '').replace(/\s+/g, ' ').trim();
  const sentences = flat.split(/(?<=[.!?])\s/);
  let gloss = (sentences[0] || flat).replace(/^[^—]{0,44}—\s*/, '');
  // A first sentence that is only a label — "EXPERIMENTAL.", "TDD coordinator."
  // once its phase prefix is stripped — describes nothing on its own. Pull the
  // next sentence in rather than shipping a stub into the cell.
  for (let i = 1; gloss.length < 40 && i < sentences.length; i += 1) {
    gloss = `${gloss} ${sentences[i]}`.trim();
  }
  if (gloss.length <= maxLen) return gloss;
  const cut = gloss.slice(0, maxLen);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

// Read one frontmatter scalar. A YAML block scalar (`>` folded, `|` literal)
// carries its value on the following indented lines, and a plain scalar may wrap
// onto them too. The previous read was anchored with `$` under the `m` flag, so
// it stopped at the first newline: a block scalar yielded its `>` indicator as
// the entire description, which reached the page as a one-character gloss.
function frontmatterScalar(fm, key) {
  const lines = fm.split('\n');
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (i === -1) return '';

  const head = lines[i].slice(key.length + 1).trim();
  const continuation = [];
  for (const line of lines.slice(i + 1)) {
    if (/^[A-Za-z_][\w-]*:/.test(line)) break;   // the next key ends the value
    if (line.trim() === '') { continuation.push(''); continue; }
    if (!/^[ \t]/.test(line)) break;             // dedented: not part of this value
    continuation.push(line.trim());
  }

  const block = /^([>|])[-+]?$/.exec(head);
  if (block) {
    // Folded joins with spaces, literal keeps its breaks. glossOf flattens
    // whitespace either way, so the distinction only matters to a caller that
    // wants the raw text.
    return continuation.join(block[1] === '>' ? ' ' : '\n').trim();
  }

  const quoted = /^(['"])([\s\S]*)\1$/.exec(head);
  return [quoted ? quoted[2] : head, ...continuation].join(' ').replace(/\s+/g, ' ').trim();
}

// Frontmatter `description:` from a SKILL.md, however the YAML spells it.
function skillDescription(repoRoot, slug) {
  const p = path.join(repoRoot, '.claude/skills', slug, 'SKILL.md');
  const fm = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(p, 'utf8'));
  if (!fm) return '';
  return glossOf(frontmatterScalar(fm[1], 'description'));
}

// Article numbers and titles come off the shipped constitution template, which
// is the byte-equal mirror of CLAUDE.md that a user actually installs. Renaming
// an Article, or adding one, moves the page from the same edit.
function readArticles(repoRoot) {
  const src = fs.readFileSync(path.join(repoRoot, 'src/CLAUDE.template.md'), 'utf8');
  const out = [];
  for (const line of src.split('\n')) {
    const m = /^## Article ([IVX]+) — (.+?)\s*(?:\((?:MANDATORY[^)]*|NON-NEGOTIABLE)\))?$/.exec(line);
    if (m) out.push({ numeral: m[1], title: m[2].trim() });
  }
  if (!out.length) throw new Error('_data/roster.cjs: no Articles parsed from src/CLAUDE.template.md');
  return out;
}

function readTracks(repoRoot) {
  const file = path.join(repoRoot, '.claude/workflows.jsonl');
  const all = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let t;
    try { t = JSON.parse(line); } catch { continue; }
    all.push({
      id: t.track_id,
      name: t.name,
      gloss: glossOf(t.description, 190),
      selectable: t.selectable === true,
      invariants: t.invariants || [],
      phases: Array.isArray(t.nodes) ? t.nodes.length : 0,
    });
  }
  return all.sort((a, b) => a.id.localeCompare(b.id));
}

module.exports = async () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const deriverUrl = pathToFileURL(
    path.resolve(repoRoot, '.claude/skills/audit-baseline/derive-counts.mjs'),
  ).href;
  const { deriveNames, SKILL_CATEGORIES } = await import(deriverUrl);
  const names = deriveNames(repoRoot);

  // The audit's own list of canonical memory categories, so the Memory page and
  // the check that validates the store cannot disagree about what the seven are.
  const memoryUrl = pathToFileURL(
    path.resolve(repoRoot, '.claude/skills/audit-baseline/checks/memory.mjs'),
  ).href;
  const { CANONICAL: memoryCanonical } = await import(memoryUrl);

  const predicatesUrl = pathToFileURL(
    path.resolve(repoRoot, 'src/cli/workflows-validator-predicates.js'),
  ).href;
  const { V1_PREDICATES: predicateVocab } = await import(predicatesUrl);
  const { byEvent, byHook } = readHookWiring(repoRoot);

  const events = EVENT_ORDER
    .filter((e) => byEvent.has(e))
    .map((e) => ({ event: e, hooks: byEvent.get(e), count: byEvent.get(e).length }));

  const unknownEvents = [...byEvent.keys()].filter((e) => !EVENT_ORDER.includes(e));
  if (unknownEvents.length) {
    // An event wired in settings.json but missing from EVENT_ORDER would drop
    // its hooks off the page silently. Fail the build instead.
    throw new Error(`_data/roster.cjs: settings.json wires unlisted event(s): ${unknownEvents.join(', ')}`);
  }

  // Every baseline hook must be wired somewhere, or the page would list a hook
  // with no event and the reader would have no way to tell whether that is a
  // documentation gap or a dead file.
  const unwired = names.hooks.filter((h) => !byHook.has(h));
  if (unwired.length) {
    throw new Error(`_data/roster.cjs: hooks on disk but not wired: ${unwired.join(', ')}`);
  }

  // Per-hook behaviour and the Article each enforces. Editorial text, so it
  // cannot be derived; it is transcribed from the Article VIII table in
  // CLAUDE.md, which is the constitutional record. Same arrangement as
  // src/cli/surface.js: the roster is derived, the prose sits beside it, and a
  // coverage check keeps the second copy honest.
  const notes = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'hooknotes.json'), 'utf8'),
  );
  const missingNotes = names.hooks.filter((h) => !notes[h]);
  const staleNotes = Object.keys(notes).filter((h) => !names.hooks.includes(h));
  if (missingNotes.length || staleNotes.length) {
    throw new Error(
      `_data/roster.cjs: hooknotes.json out of sync with disk. ` +
      `missing: [${missingNotes.join(', ')}] stale: [${staleNotes.join(', ')}]`,
    );
  }

  return {
    hooks: names.hooks.map((h) => ({
      name: h,
      events: [...byHook.get(h)].sort(),
      article: notes[h].article,
      note: notes[h].note,
    })),
    events,
    // Sum of the per-event tallies, which exceeds the hook count because a
    // multi-event script is counted once per event. Rendered rather than
    // hand-typed so the arithmetic on the page cannot go stale.
    eventTallySum: events.reduce((n, e) => n + e.count, 0),
    skills: names.skills.map((s) => ({ name: s, gloss: skillDescription(repoRoot, s) })),
    skillCategories: SKILL_CATEGORIES,
    skillCategoryCount: Object.keys(SKILL_CATEGORIES).length,
    tracks: names.tracks,
    // Full track records for the reference page. `selectable` splits the nine
    // a human can pick at triage from the two that only selector nodes enter.
    trackDetail: readTracks(repoRoot),
    mcpServers: names.mcpServers,
    mcpDetail: (() => {
      const cfg = JSON.parse(fs.readFileSync(path.join(repoRoot, '.mcp.json'), 'utf8'));
      const notes = JSON.parse(fs.readFileSync(path.join(__dirname, 'mcpnotes.json'), 'utf8'));
      const missing = names.mcpServers.filter((s) => !notes[s]);
      const stale = Object.keys(notes).filter((s) => !names.mcpServers.includes(s));
      if (missing.length || stale.length) {
        throw new Error(
          `_data/roster.cjs: mcpnotes.json out of sync with .mcp.json. ` +
          `missing: [${missing.join(', ')}] stale: [${stale.join(', ')}]`,
        );
      }
      return names.mcpServers.map((s) => {
        const entry = cfg.mcpServers[s] || {};
        return {
          name: s,
          command: [entry.command, ...(entry.args || [])].filter(Boolean).join(' '),
          note: notes[s],
        };
      });
    })(),
    commands: names.commands,
    subagents: names.subagents,
    articles: (() => {
      const articles = readArticles(repoRoot);
      const glosses = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'articlenotes.json'), 'utf8'),
      );
      const missing = articles.filter((a) => !glosses[a.numeral]).map((a) => a.numeral);
      const stale = Object.keys(glosses).filter((n) => !articles.some((a) => a.numeral === n));
      if (missing.length || stale.length) {
        throw new Error(
          '_data/roster.cjs: articlenotes.json out of sync with src/CLAUDE.template.md. '
          + `missing: [${missing.join(', ')}] stale: [${stale.join(', ')}]`,
        );
      }
      return articles.map((a) => ({ ...a, gloss: glosses[a.numeral] }));
    })(),
    articleCount: readArticles(repoRoot).length,
    memory: (() => {
      const notes = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'memorynotes.json'), 'utf8'),
      );
      const missing = memoryCanonical.filter((c) => !notes[c]);
      const stale = Object.keys(notes).filter((c) => !memoryCanonical.includes(c));
      if (missing.length || stale.length) {
        throw new Error(
          '_data/roster.cjs: memorynotes.json out of sync with the audit\'s CANONICAL list. '
          + `missing: [${missing.join(', ')}] stale: [${stale.join(', ')}]`,
        );
      }
      return memoryCanonical.map((c) => ({ name: c, ...notes[c] }));
    })(),
    memoryCount: memoryCanonical.length,
    // The closed v1 predicate vocabulary, read from the module that enforces it.
    // Article IV invariant I11 rejects any predicate outside this set, so the
    // page and the validator cannot disagree about what the vocabulary is.
    predicates: (() => {
      const notes = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'predicatenotes.json'), 'utf8'),
      );
      const names = [...predicateVocab].sort();
      const missing = names.filter((p) => !notes[p]);
      const stale = Object.keys(notes).filter((p) => !names.includes(p));
      if (missing.length || stale.length) {
        throw new Error(
          '_data/roster.cjs: predicatenotes.json out of sync with V1_PREDICATES. '
          + `missing: [${missing.join(', ')}] stale: [${stale.join(', ')}]`,
        );
      }
      return names.map((p) => ({ name: p, note: notes[p] }));
    })(),
    // Lever names and shipped defaults come off src/project.template.json, the
    // project.json a fresh install actually receives. A lever flipped in the
    // template moves this table; a lever flipped in THIS repo's own
    // .claude/project.json does not, which is the correct reading for docs.
    velocity: (() => {
      const tpl = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'src/project.template.json'), 'utf8'),
      );
      const levers = tpl.velocity || {};
      const notes = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'velocitynotes.json'), 'utf8'),
      );
      const keys = Object.keys(levers).sort();
      const missing = keys.filter((k) => !notes[k]);
      const stale = Object.keys(notes).filter((k) => !keys.includes(k));
      if (missing.length || stale.length) {
        throw new Error(
          '_data/roster.cjs: velocitynotes.json out of sync with src/project.template.json. '
          + `missing: [${missing.join(', ')}] stale: [${stale.join(', ')}]`,
        );
      }
      const rows = keys.map((k) => ({
        name: k,
        on: levers[k].enabled === true,
        note: notes[k],
      }));
      return {
        levers: rows,
        total: rows.length,
        onByDefault: rows.filter((r) => r.on).length,
        offByDefault: rows.filter((r) => !r.on).length,
      };
    })(),
  };
};
