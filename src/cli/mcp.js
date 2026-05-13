import { readFile, writeFile, access } from 'node:fs/promises';

/**
 * Merge `template/.mcp.json` into the target's `.mcp.json` with **baseline-refresh**
 * semantics:
 *
 *   - Servers named in the template are baseline-canonical. The merge refreshes
 *     them from the template — so users running `--merge` receive baseline arg
 *     and env updates (e.g., the `--browser chrome --isolated` flags on
 *     playwright). A user who customized a baseline-named server loses that
 *     customization; intentional customizations belong under a non-baseline name.
 *   - Servers absent from the template are user-added and are preserved byte-for-byte.
 *   - Top-level JSON keys outside `mcpServers` follow the same rule: template
 *     keys are added when missing; target's existing keys are preserved.
 *   - When the target is absent, the template is written verbatim.
 *
 * Decision recorded in: README "MCP merge semantics"; this comment is the
 * authoritative implementation note.
 */
export async function deepMergeMcpServers(templatePath, targetPath) {
  const templateText = await readFile(templatePath, 'utf8');
  const template = JSON.parse(templateText);

  let target;
  try {
    await access(targetPath);
    const targetText = await readFile(targetPath, 'utf8');
    target = JSON.parse(targetText);
  } catch {
    await writeFile(targetPath, templateText);
    return;
  }

  const tplServers = (template && template.mcpServers) || {};
  const tgtServers = (target && target.mcpServers) || {};

  // Baseline-canonical names = names that appear in the template. Refresh those
  // from the template; preserve every other server byte-for-byte.
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

  await writeFile(targetPath, JSON.stringify(merged, null, 2) + '\n');
}
