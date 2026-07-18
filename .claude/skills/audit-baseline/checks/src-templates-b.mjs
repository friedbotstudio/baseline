// src/ templates, part B — the .mcp/settings/swarm-worker wiring templates and
// the pristine memory templates. Skipped on a consumer install (src/ absent).
export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  if (ctx.skipSrc) return rows;
  const { exists, readText } = ctx;

  if (!exists('src/.mcp.template.json')) {
    add('src templates: .mcp.template.json', 'FAIL', 'missing');
  } else {
    try {
      const servers = Object.keys((JSON.parse(readText('src/.mcp.template.json')).mcpServers) || {});
      const missing = [...ctx.EXPECTED_MCP_SERVERS].filter(s => !servers.includes(s));
      if (missing.length) add('src templates: .mcp.template.json', 'FAIL', `baseline servers missing: ${JSON.stringify(missing)}`);
      else add('src templates: .mcp.template.json', 'PASS', `baseline servers present (${servers.length} declared)`);
    } catch (e) { add('src templates: .mcp.template.json', 'FAIL', `invalid JSON: ${e.message}`); }
  }

  if (!exists('src/settings.template.json')) {
    add('src templates: settings.template.json', 'FAIL', 'missing');
  } else {
    try {
      const sText = readText('src/settings.template.json');
      JSON.parse(sText);
      const missingWired = [...ctx.EXPECTED_HOOKS].filter(h => !sText.includes(`${h}.sh`) && !sText.includes(`${h}.mjs`)).sort();
      if (missingWired.length) {
        const head = missingWired.slice(0, 3);
        const tail = missingWired.length > 3 ? ` + ${missingWired.length - 3} more` : '';
        add('src templates: settings.template.json', 'FAIL', `baseline hooks not wired: ${JSON.stringify(head)}${tail}`);
      } else {
        add('src templates: settings.template.json', 'PASS', `all ${ctx.EXPECTED_HOOKS.size} baseline hooks wired`);
      }
    } catch (e) { add('src templates: settings.template.json', 'FAIL', `invalid JSON: ${e.message}`); }
  }

  if (!exists('src/agents/swarm-worker.template.md')) {
    add('src templates: agents/swarm-worker.template.md', 'FAIL', 'missing');
  } else {
    const wt = readText('src/agents/swarm-worker.template.md');
    const missingTokens = ['{{NAME}}', '{{DESCRIPTION}}', '{{SKILLS}}', '{{ROLE_LINE}}'].filter(t => !wt.includes(t));
    if (missingTokens.length) add('src templates: agents/swarm-worker.template.md', 'FAIL', `tokens missing: ${JSON.stringify(missingTokens)}`);
    else add('src templates: agents/swarm-worker.template.md', 'PASS', 'all 4 tokens present');
  }

  const canonicalMemory = [...ctx.EXPECTED_MEMORY_FILES].filter(n => n !== '_pending' && n !== '_resume' && n !== '_thread');
  if (!ctx.isDir('src/memory')) {
    add('src templates: memory/', 'FAIL', 'missing src/memory/');
  } else {
    for (const name of canonicalMemory.sort()) {
      const rel = `src/memory/${name}.template.md`;
      if (!exists(rel)) { add(`src templates: memory/${name}.template.md`, 'FAIL', 'missing'); continue; }
      const text = readText(rel);
      if (!text.startsWith('---')) { add(`src templates: memory/${name}.template.md`, 'FAIL', 'missing frontmatter'); continue; }
      const splitOnce = text.split('---');
      const body = splitOnce.length >= 3 ? splitOnce.slice(2).join('---') : text;
      const entryCount = (body.replace(/^```[\s\S]*?^```\s*$/gm, '').match(/^##\s+\S/gm) || []).length;
      if (entryCount > 0) add(`src templates: memory/${name}.template.md`, 'FAIL', `template must be pristine; ${entryCount} entries found`);
      else add(`src templates: memory/${name}.template.md`, 'PASS', 'pristine');
    }
  }
  return rows;
}
