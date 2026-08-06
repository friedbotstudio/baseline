// Foundation — write_set-gated diagram profile resolver.
//
// resolveProfile(content, projectGet) inspects a spec body's write_set and the
// project's compression config, returning the diagram set the spec must satisfy:
//   - the full set (artifacts.required_diagrams.spec) when compression is off,
//     the write_set is un-extractable, no profile fully covers it, or anything
//     throws — every uncertain case fails OPEN to today's behavior;
//   - a profile's reduced set when compression is on AND every write_set path is
//     covered by that profile's `when` globs (a single uncovered path — e.g. a
//     src/** file — forces the full set, so architecture always wins).
//
// Self-contained (stdlib-only): the brace/glob and write_set-extraction helpers
// mirror spec_design_calls_guard.mjs but are copied here so a hook lib never
// imports another hook.

function expandBraces(globs) {
  const out = [];
  for (const g of globs) {
    if (!g.includes('{')) { out.push(g); continue; }
    const i = g.indexOf('{'), j = g.indexOf('}', i);
    if (j < 0) { out.push(g); continue; }
    const prefix = g.slice(0, i);
    const alts = g.slice(i + 1, j).split(',');
    const suffix = g.slice(j + 1);
    for (const a of alts) out.push(prefix + a.trim() + suffix);
  }
  return out;
}

function globToRegex(g) {
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { out += '.*'; i++; }
      else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if ('.+()|^$\\[]{}'.includes(c)) out += '\\' + c;
    else out += c;
  }
  return new RegExp('^' + out + '$');
}

function matchesAnyGlob(path, globs) {
  for (const g of expandBraces(globs)) {
    if (globToRegex(g).test(path)) return true;
  }
  return false;
}

function extractWriteSet(content) {
  const paths = new Set();
  for (const line of content.split(/\r?\n/)) {
    // Accept the colon form (`write_set: ...`), the markdown-bold heading
    // (`**Write set**: ...`), and the prose form (`The write_set is ...`) — real
    // specs (and the compression feature's own spec) declare it in prose, which
    // the colon-only regex silently missed, so the reduction never fired.
    const m = /write[_\s]set\*{0,2}\s*(?::|is\s)\s*(.+)$/i.exec(line);
    if (!m) continue;
    for (let tok of m[1].split(/[`,\s|]+/)) {
      tok = tok.trim().replace(/^\*+|\*+$/g, '').trim();
      if (tok && tok.includes('/') && !tok.startsWith('#')) paths.add(tok);
    }
  }
  return [...paths];
}

function coversEntirely(profile, writeSetPaths) {
  return Array.isArray(profile.when)
    && writeSetPaths.every((p) => matchesAnyGlob(p, profile.when));
}

// A spec may satisfy the structural diagram kinds by REFERENCING a corpus element
// instead of redrawing it. Only the SYNTAX is judged here: resolving the id needs
// the corpus, and this module is deliberately stdlib-only.
//
// A malformed reference forces the full set rather than throwing. An author who
// meant to reference something and mistyped it must not get a QUIETER requirement
// than one who referenced nothing at all — that would make a typo the cheapest way
// to thin a spec.
const REF_TOKEN = /@ref\b[^\n`]*/g;
const REF_WELL_FORMED = /^@ref\s+element:[a-z0-9][a-z0-9-]*$/;

export function referenceTokens(content) {
  return String(content).match(REF_TOKEN) ?? [];
}

export function hasMalformedReference(content) {
  return referenceTokens(content).some((token) => !REF_WELL_FORMED.test(token.trim()));
}

export function resolveProfile(content, projectGet) {
  const fullSet = () => ({ id: 'full', required_diagrams: projectGet('.artifacts.required_diagrams.spec') });
  try {
    if (projectGet('.artifacts.compression.enabled') === false) return fullSet();
    if (hasMalformedReference(content)) return fullSet();

    const writeSetPaths = extractWriteSet(content);
    if (writeSetPaths.length === 0) return fullSet();

    // A write_set touching any security-sensitive path always requires the full
    // architectural set — the reduction must never thin documentation for a
    // sensitive surface (CWE-693). Defense-in-depth: fires even if a profile's
    // `when` were to cover a sensitive glob.
    const sensitive = projectGet('.security.sensitive_globs');
    if (Array.isArray(sensitive) && writeSetPaths.some((p) => matchesAnyGlob(p, sensitive))) {
      return fullSet();
    }

    const profiles = projectGet('.artifacts.diagram_profiles');
    if (!Array.isArray(profiles) || profiles.length === 0) return fullSet();

    const match = profiles.find((p) => coversEntirely(p, writeSetPaths) && p.required_diagrams);
    return match
      ? { id: match.id, required_diagrams: match.required_diagrams }
      : fullSet();
  } catch {
    return fullSet();
  }
}
