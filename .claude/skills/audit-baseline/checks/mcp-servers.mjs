// .mcp.json servers — the required baseline servers are declared; the default
// current-docs satisfier (context7) is reported when present, never required.
export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const mcp = ctx.readJson('.mcp.json');
  if (mcp === null) { add('.mcp.json parses', 'FAIL', 'missing or invalid JSON'); return rows; }
  add('.mcp.json parses', 'PASS', '');
  const servers = Object.keys(mcp.mcpServers || {});
  for (const s of [...ctx.EXPECTED_MCP_SERVERS]) {
    add(`mcp server: ${s}`, servers.includes(s) ? 'PASS' : 'FAIL', servers.includes(s) ? '' : 'not declared');
  }
  for (const s of [...ctx.DEFAULT_MCP_SERVERS]) {
    if (servers.includes(s)) add(`mcp server: ${s} (default)`, 'PASS', 'present — default current-docs satisfier');
  }
  return rows;
}
