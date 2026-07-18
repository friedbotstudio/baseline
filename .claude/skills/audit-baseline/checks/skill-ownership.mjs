// Skill ownership — invalid `owner:` frontmatter values, plus manifest hash-drift
// / missing-file detection for every baseline-owned skill (Article XII).
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const { root } = ctx;

  for (const slug of [...ctx.diskSkills].sort()) {
    const owner = ctx.readSkillOwner(slug);
    if (owner === null) continue;
    if (owner !== 'baseline' && owner !== 'user') add(`skill ownership: ${slug}`, 'FAIL', `invalid owner=${owner}`);
  }
  const manifest = ctx.loadManifest();
  if (!manifest) {
    add('skill ownership: manifest', 'WARN', '.claude/manifest.json (or obj/template/.claude/manifest.json) missing — run npm run build');
    return rows;
  }
  const ownersSkills = (manifest.owners || {}).skills || {};
  const filesMap = manifest.files || {};
  for (const slug of Object.keys(ownersSkills).sort()) {
    const skillDir = join(root, '.claude', 'skills', slug);
    if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
      add(`skill ownership: ${slug}`, 'FAIL', 'baseline skill missing');
      continue;
    }
    for (const [path, entry] of Object.entries(filesMap)) {
      if (!path.startsWith(`.claude/skills/${slug}/`)) continue;
      const diskFile = join(root, path);
      if (!existsSync(diskFile)) { add(`skill ownership: ${slug}`, 'FAIL', `baseline skill missing: ${path}`); continue; }
      if (ctx.skipHashCheck) continue;
      const expectedHash = typeof entry === 'string' ? entry : (entry && entry.sha256);
      const actual = createHash('sha256').update(readFileSync(diskFile)).digest('hex');
      if (actual !== expectedHash) { add(`skill ownership: ${slug}`, 'FAIL', `hash mismatch at ${path}`); break; }
    }
  }
  return rows;
}
