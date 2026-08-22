// Orchestration: the live MCP stdio server. This is the ONLY file in the channel
// that imports the SDK — the coordination core (handlers + lib) stays SDK-free.
// Each call resolves its channelRoot from a validated sprint_id (CWE-22 guard),
// then delegates to the slice-B handlers.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isSafeId } from './lib/safe-id.mjs';
import { resolveStateRoot } from './lib/root.mjs';
import { resolveChannelId } from './lib/tasks.mjs';
import { instructionsFor, CHANNEL_ROLE, CHANNEL_PEER_ID } from './lib/instructions.mjs';
import { TOOLS, TOOL_NAMES } from './tools.mjs';

export { instructionsFor };

// Resolved on first use, not at import: a non-git project that never touches the
// channel must still be able to start a session, and one that does touch it gets
// the named StateRootError rather than a private store under its own cwd.
let stateRoot = null;
function stateRootDir() {
  if (stateRoot === null) stateRoot = resolveStateRoot();
  return stateRoot;
}

function channelRoot(sprint_id) {
  if (!isSafeId(sprint_id)) throw new Error(`invalid sprint_id: ${sprint_id}`);
  const root = join(stateRootDir(), sprint_id);
  mkdirSync(root, { recursive: true });
  return root;
}

const reply = (result) => ({
  content: [{ type: 'text', text: JSON.stringify(result) }],
  structuredContent: result,
});

export function buildServer() {
  const server = new McpServer({ name: 'baseline', version: '0.1.0' }, { instructions: instructionsFor(CHANNEL_ROLE, CHANNEL_PEER_ID) });
  for (const [name, description, inputSchema, run] of TOOLS) {
    server.registerTool(name, { description, inputSchema }, async ({ sprint_id, ...rest }) => reply(run(channelRoot(resolveChannelId(sprint_id)), rest)));
  }
  return server;
}

export { TOOL_NAMES };

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const transport = new StdioServerTransport();
  await buildServer().connect(transport);
  process.stderr.write('baseline MCP server running on stdio\n');
}
