#!/usr/bin/env node
// Phase 11.5 Changelog actuator.
//
// CLI:
//   node changelog.mjs --slug <slug> [--project-root <path>]
//   node changelog.mjs --preview-only --slug <slug> [--project-root <path>]
//
// Active mode: verifies commit_consent freshness, classifies new commits,
// appends keepachangelog entries under ## [Unreleased] in CHANGELOG.md,
// writes ChangelogState to .claude/state/changelog/<slug>.json.
//
// Preview mode: prints projected next version + draft fragment; no writes.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { classify } from './classifier.mjs';
import { previewProjectedVersion } from './version-preview.mjs';
import { writeState } from './state-writer.mjs';
import { appendUnderUnreleased } from './unreleased-writer.mjs';

const TTL_SECONDS = 900;

function parseCli() {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string' },
      'preview-only': { type: 'boolean', default: false },
      'project-root': { type: 'string', default: '.' },
      'entries-file': { type: 'string' },
      'allow-shrink': { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (!values.slug) {
    process.stderr.write('error: --slug required\n');
    process.exit(2);
  }
  return {
    slug: values.slug,
    previewOnly: values['preview-only'],
    projectRoot: resolve(values['project-root']),
    entriesFile: values['entries-file'],
    allowShrink: values['allow-shrink'],
  };
}

const KEEPACHANGELOG_SECTIONS = new Set(['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security']);

// Read + validate the caller-supplied entries file: a JSON array of
// { section, body, breaking? }. `section` must be a keepachangelog section and
// `body` a non-empty string. Throws on any malformed input (the caller exits 1
// BEFORE touching CHANGELOG.md, so a bad file never half-writes the changelog).
function readEntriesFile(entriesPath) {
  let raw;
  try {
    raw = readFileSync(entriesPath, 'utf8');
  } catch (err) {
    throw new Error(`cannot read --entries-file ${entriesPath}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`--entries-file ${entriesPath} is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`--entries-file ${entriesPath} must contain a JSON array of {section, body, breaking?}`);
  }
  return parsed.map((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`--entries-file entry ${i} is not an object`);
    }
    if (!KEEPACHANGELOG_SECTIONS.has(entry.section)) {
      throw new Error(`--entries-file entry ${i} has invalid section ${JSON.stringify(entry.section)} (expected one of: ${[...KEEPACHANGELOG_SECTIONS].join(', ')})`);
    }
    if (typeof entry.body !== 'string' || entry.body.trim() === '') {
      throw new Error(`--entries-file entry ${i} has an empty or non-string body`);
    }
    return { section: entry.section, body: entry.body, breaking: Boolean(entry.breaking) };
  });
}

function checkConsent(projectRoot) {
  const path = join(projectRoot, '.claude/state/commit_consent');
  if (!existsSync(path)) {
    return { ok: false, reason: 'consent absent (no commit_consent token)' };
  }
  // Token contract: line 1 is the unix epoch when /grant-commit was issued.
  // Reading the epoch (not filesystem mtime) keeps the freshness check
  // consistent with how `/grant-commit` writes the file and with how tests
  // stale the consent via `echo "<old-epoch>" > commit_consent`.
  const firstLine = readFileSync(path, 'utf8').split('\n', 1)[0].trim();
  const tokenEpoch = parseInt(firstLine, 10);
  if (!Number.isFinite(tokenEpoch)) {
    return { ok: false, reason: 'consent malformed (line 1 not an epoch)' };
  }
  const ageSeconds = Math.floor(Date.now() / 1000) - tokenEpoch;
  if (ageSeconds > TTL_SECONDS) {
    return {
      ok: false,
      reason: `consent expired (${ageSeconds}s > ${TTL_SECONDS}s)`,
    };
  }
  return { ok: true };
}

function getHeadSha(projectRoot) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: projectRoot, encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function buildEntry(commit) {
  const cls = classify(commit);
  if (!cls) return null;
  return {
    section: cls.section,
    body: commit.subject,
    conventional_type: commit.type,
    conventional_scope: commit.scope,
    breaking: cls.breaking,
  };
}

function renderPreviewFragment(projection) {
  const lines = [];
  lines.push(`Projected: ${projection.version} (${projection.type || 'no release'})`);
  lines.push(`Commits analyzed: ${projection.commits.length}`);
  if (projection.commits.length > 0) {
    lines.push('');
    lines.push('Draft fragment under ## [Unreleased]:');
    const entries = projection.commits.map(buildEntry).filter(Boolean);
    if (entries.length === 0) {
      lines.push('(no commits map to keepachangelog sections)');
    } else {
      const grouped = new Map();
      for (const e of entries) {
        if (!grouped.has(e.section)) grouped.set(e.section, []);
        grouped.get(e.section).push(e);
      }
      for (const [section, items] of grouped) {
        lines.push('');
        lines.push(`### ${section}`);
        for (const item of items) {
          const prefix = item.breaking ? '**BREAKING:** ' : '';
          lines.push(`- ${prefix}${item.body}`);
        }
      }
    }
  }
  return lines.join('\n') + '\n';
}

async function runPreviewMode({ projectRoot }) {
  const projection = await previewProjectedVersion(projectRoot);
  process.stdout.write(renderPreviewFragment(projection));
  process.exit(0);
}

async function runActiveMode({ slug, projectRoot, entriesFile, allowShrink }) {
  // The caller (main context, which knows the impending change) supplies the
  // keepachangelog entries. The actuator no longer classifies from `git log`:
  // Phase 11.5 runs BEFORE /commit, so git-log holds prior commits, not this
  // change. `--preview-only` still uses semantic-release for a version
  // projection; active mode does not.
  if (!entriesFile) {
    process.stderr.write(
      'error: active mode requires --entries-file <path> (a JSON array of {section, body, breaking?}). '
      + 'The actuator no longer derives entries from git log; the caller writes the impending change\'s entries. '
      + 'Use --preview-only for a semantic-release version projection.\n',
    );
    process.exit(1);
  }
  const consent = checkConsent(projectRoot);
  if (!consent.ok) {
    process.stderr.write(`error: ${consent.reason}\n`);
    process.exit(1);
  }
  let entries;
  try {
    entries = readEntriesFile(resolve(projectRoot, entriesFile));
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
  const changelogPath = join(projectRoot, 'CHANGELOG.md');
  await appendUnderUnreleased(changelogPath, entries, { guardShrink: !allowShrink });
  const state = {
    slug,
    source_commit_sha: getHeadSha(projectRoot),
    projected_version: null,
    projected_type: null,
    entries,
    generated_at: new Date().toISOString(),
    unreleased_inserted_at: new Date().toISOString(),
  };
  await writeState(projectRoot, slug, state);
  process.stdout.write(
    `changelog: wrote ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} to ${changelogPath} from ${entriesFile}\n`,
  );
}

async function main() {
  const cli = parseCli();
  if (cli.previewOnly) {
    await runPreviewMode(cli);
  } else {
    await runActiveMode(cli);
  }
}

main().catch((err) => {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
});
