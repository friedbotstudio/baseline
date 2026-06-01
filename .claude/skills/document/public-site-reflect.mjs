// public-site-reflect.mjs — /document Step 2 reflective behavior-change trigger.
//
// The public site (`site-src/**/*.njk`) DESCRIBES the harness's behavior. When a
// change alters a skill / hook / command, a public page that names it may need a
// description update — even when no `site-src/**` file is in the diff. Step 2's
// file-presence survey misses that (it concludes "no site work" when no site
// file changed). This helper closes the gap (backlog 5e07): it derives the
// governance tokens the diff touches and greps the site for pages that name
// them, so Step 2 can route those pages for update (reference register) AND a
// feature-value pass (persuasive/copywriting register, backlog 7b3e).
//
// Pure read of the repo tree: deterministic, no writes, no network, stdlib only.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// changed file path -> governance token(s). A changed `.claude/skills/<slug>/…`
// yields the skill slug; `.claude/hooks/<name>.mjs` the hook name; a command
// `.claude/commands/<name>.md` the command name. Other paths yield nothing.
function deriveTokens(changedPaths) {
  const tokens = [];
  const seen = new Set();
  const push = (token, kind) => {
    const key = `${kind}:${token}`;
    if (!seen.has(key)) { seen.add(key); tokens.push({ token, kind }); }
  };
  for (const p of changedPaths) {
    let m;
    if ((m = p.match(/(?:^|\/)\.claude\/skills\/([^/]+)\//))) push(m[1], 'skill');
    else if ((m = p.match(/(?:^|\/)\.claude\/hooks\/([^/]+)\.mjs$/))) push(m[1], 'hook');
    else if ((m = p.match(/(?:^|\/)\.claude\/commands\/([^/]+)\.md$/))) push(m[1], 'command');
  }
  return tokens;
}

function listNjk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listNjk(p, acc);
    else if (e.name.endsWith('.njk')) acc.push(p);
  }
  return acc;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Find public pages that DESCRIBE a behavior the diff changed.
// { changedPaths: string[], root?: string } -> Array<{ page, token, kind }>.
// `page` is repo-relative. A token matches a page only as a whole token
// (word-boundary), so `document` does not match inside `documentation`.
export function findDescribedSurfaces({ changedPaths = [], root = process.env.CLAUDE_PROJECT_DIR || process.cwd() } = {}) {
  const tokens = deriveTokens(changedPaths);
  if (tokens.length === 0) return [];
  const pages = listNjk(join(root, 'site-src'));
  const out = [];
  const seen = new Set();
  for (const page of pages) {
    let text;
    try { text = readFileSync(page, 'utf8'); } catch { continue; }
    for (const { token, kind } of tokens) {
      if (new RegExp(`\\b${escapeRe(token)}\\b`).test(text)) {
        const rel = page.startsWith(root) ? page.slice(root.length + 1) : page;
        const key = `${rel}|${token}`;
        if (!seen.has(key)) { seen.add(key); out.push({ page: rel, token, kind }); }
      }
    }
  }
  return out;
}
