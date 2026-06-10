#!/usr/bin/env node
// verify-action-shas.mjs — pre-publish / pre-release verifier.
//
// Walks every workflow under .github/workflows/, extracts each
// `uses: owner/repo@<40-hex-sha> # vX.Y.Z` directive, and resolves the
// pinned SHA against the upstream tag via `git ls-remote`. Reports any
// SHA that does not match the named tag's commit on the upstream repo
// (the exact risk class the SEC-MEDIUM "SHA authenticity not test-enforced"
// finding called out in docs/archive/2026-05-13/release-workflow/security.md).
//
// Why git ls-remote and not the GitHub REST API:
//   - No authentication required (works against any public repo).
//   - Not subject to the 60 req/hour unauthenticated GitHub API rate limit.
//   - Handles both lightweight tags (single line) and annotated tags
//     (two lines, second carries a `^{}` peeled-commit suffix) uniformly.
//
// Exit codes:
//   0 — every (action, tag) pair verified (SHA matches upstream tag commit)
//   1 — one or more drifts / unreachable refs detected
//   2 — bad invocation (no workflows found, etc.)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const WORKFLOWS_DIR = '.github/workflows';
const USES_RE = /^\s*-?\s*uses:\s*([^\s/]+\/[^\s@]+)@([0-9a-f]{40})\s*#\s*(v[0-9A-Za-z.+\-]+)/gm;

function collectDirectives() {
  if (!existsSync(WORKFLOWS_DIR)) return [];
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));
  const directives = [];
  for (const f of files) {
    const text = readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8');
    for (const m of text.matchAll(USES_RE)) {
      directives.push({ workflow: f, owner_repo: m[1], sha: m[2], tag: m[3] });
    }
  }
  return directives;
}

function dedupe(directives) {
  const unique = new Map();
  for (const d of directives) {
    const key = `${d.owner_repo}@${d.sha}#${d.tag}`;
    if (!unique.has(key)) unique.set(key, d);
  }
  return [...unique.values()];
}

function resolveUpstream(owner_repo, tag) {
  const url = `https://github.com/${owner_repo}.git`;
  try {
    // Query both the tag ref and its peeled form. For an annotated tag,
    // `refs/tags/<tag>` resolves to the tag *object* SHA, while the commit
    // that `owner/repo@<tag>` actually checks out is exposed only via the
    // `refs/tags/<tag>^{}` peeled ref. Dependabot pins the peeled commit, so
    // without this second pattern annotated tags false-positive as DRIFT.
    // Lightweight tags ignore the harmless extra pattern (single line back).
    const out = execFileSync('git', ['ls-remote', url, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], {
      encoding: 'utf8',
      timeout: 15_000,
    }).trim();
    return { ok: true, raw: out };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function classify(directive) {
  const { owner_repo, sha, tag } = directive;
  const upstream = resolveUpstream(owner_repo, tag);
  if (!upstream.ok) {
    return { ...directive, verdict: 'UNREACHABLE', detail: upstream.error };
  }
  if (!upstream.raw) {
    return { ...directive, verdict: 'TAG_NOT_FOUND', detail: `refs/tags/${tag} missing on upstream` };
  }
  const lines = upstream.raw.split('\n');
  const shas = new Set();
  let peeled = null;
  for (const line of lines) {
    const [s, ref] = line.split('\t');
    if (!s) continue;
    shas.add(s.trim());
    if (ref && ref.endsWith('^{}')) peeled = s.trim();
  }
  if (shas.has(sha)) {
    const kind = peeled === sha ? 'commit (peeled)' : peeled ? 'tag-object' : 'commit (lightweight)';
    return { ...directive, verdict: 'OK', detail: kind };
  }
  const canonical = peeled || [...shas][0];
  return { ...directive, verdict: 'DRIFT', detail: `upstream ${tag} = ${canonical}` };
}

function report(results) {
  const total = results.length;
  const verified = results.filter((r) => r.verdict === 'OK').length;
  const violations = results.filter((r) => r.verdict !== 'OK');

  console.log(`Action SHA authenticity: ${verified}/${total} verified`);
  for (const v of violations) {
    console.error(
      `  ${v.verdict}: ${v.workflow} ${v.owner_repo}@${v.sha.slice(0, 8)} # ${v.tag} — ${v.detail}`
    );
  }
  return violations.length === 0 ? 0 : 1;
}

const directives = collectDirectives();
if (directives.length === 0) {
  console.log('No third-party `uses:` directives with SHA pin + tag comment found in .github/workflows/.');
  process.exit(0);
}

const unique = dedupe(directives);
const results = unique.map(classify);
process.exit(report(results));
