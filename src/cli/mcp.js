import { readFile, writeFile, access } from 'node:fs/promises';

/**
 * Compute the deep-merged `.mcp.json` content (in memory) without writing.
 *
 * Returns `{ merged, existing }`:
 *   - `merged` — the serialized JSON the merge would write
 *     (`JSON.stringify(obj, null, 2) + '\n'`).
 *   - `existing` — the existing target file's text, or `null` when the target
 *     file is absent.
 *
 * Pure: no filesystem mutation. Callers compare `merged === existing` to decide
 * whether a write is necessary; this is the seam that turns idempotent re-runs
 * into a NOOP action instead of an unconditional rewrite.
 *
 * Merge semantics (unchanged from prior `deepMergeMcpServers` contract):
 *   - Servers named in the template are baseline-canonical. The merge refreshes
 *     them from the template — so users running upgrade receive baseline arg
 *     and env updates (e.g., the `--browser chrome --isolated` flags on
 *     playwright). A user who customized a baseline-named server loses that
 *     customization; intentional customizations belong under a non-baseline name.
 *   - Servers absent from the template are user-added and are preserved byte-for-byte.
 *   - Top-level JSON keys outside `mcpServers` follow the same rule: template
 *     keys are added when missing; target's existing keys are preserved.
 *   - When the target is absent, the merged output is the template text verbatim.
 *
 * Decision recorded in: README "MCP merge semantics"; this comment is the
 * authoritative implementation note.
 */
export async function computeMergedMcpServers(templatePath, targetPath) {
  const templateText = await readFile(templatePath, 'utf8');
  const template = JSON.parse(templateText);

  let existingText = null;
  try {
    await access(targetPath);
    existingText = await readFile(targetPath, 'utf8');
  } catch {
    return { merged: templateText, existing: null };
  }

  const target = JSON.parse(existingText);
  const tplServers = (template && template.mcpServers) || {};
  const tgtServers = (target && target.mcpServers) || {};

  const mergedServers = { ...tgtServers };
  for (const [name, cfg] of Object.entries(tplServers)) {
    mergedServers[name] = cfg;
  }

  const merged = { ...target, mcpServers: mergedServers };

  for (const [key, value] of Object.entries(template || {})) {
    if (key === 'mcpServers') continue;
    if (!(key in merged)) {
      merged[key] = value;
    }
  }

  return { merged: JSON.stringify(merged, null, 2) + '\n', existing: existingText };
}

/**
 * Deep-merge `template/.mcp.json` into the target's `.mcp.json`.
 *
 * Returns `{ wrote: boolean }`:
 *   - `wrote: false` when the merge would produce byte-identical output to the
 *     existing target — no write occurs, mtime preserved. Idempotent re-runs
 *     report this as a NOOP action via `merge.js`'s SPECIAL_MERGE branch.
 *   - `wrote: true` when the target was created (absent before) or the merge
 *     produces bytes that differ from the existing target — file is rewritten.
 *
 * Spec: docs/specs/upgrade-version-aware-noop.md §Behavior #4. The byte-equal
 * short-circuit is the fix for the "Applied 1 update(s)" misreport on no-op
 * upgrades.
 */
export async function deepMergeMcpServers(templatePath, targetPath) {
  const { merged, existing } = await computeMergedMcpServers(templatePath, targetPath);
  if (merged === existing) return { wrote: false };
  await writeFile(targetPath, merged);
  return { wrote: true };
}
