// Foundation — resolves which MCP server acts as this project's documentation
// fetcher.
//
// Article VI.5 mandates an OUTCOME (verify a third-party API against current docs),
// never a tool. Before this module the shipped default was named in the
// constitution, the genesis spec and eight skills, so replacing it meant an
// amendment — which is why it never happened. The name now lives in one file and
// everything else asks.
//
// This is a pointer, not a validator. It returns whatever name it finds, including
// a server the baseline has never heard of, because pointing at your own
// self-hosted or third-party provider is the whole affordance. An undeclared name
// surfaces when a skill calls it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const POINTER = '.claude/docs-provider.json';

// The shipped provider. A broken pointer must never stop a skill verifying an API
// against current docs, so every degenerate read falls back here rather than
// throwing — the outcome matters more than the configuration being well-formed.
const SHIPPED_DEFAULT = 'gitmcp';

export function readDocsProvider({ rootDir = process.cwd() } = {}) {
  try {
    const parsed = JSON.parse(readFileSync(join(rootDir, POINTER), 'utf8'));
    const provider = parsed?.provider;
    return typeof provider === 'string' && provider.length > 0 ? provider : SHIPPED_DEFAULT;
  } catch {
    return SHIPPED_DEFAULT;
  }
}

export { POINTER as DOCS_PROVIDER_POINTER, SHIPPED_DEFAULT as DEFAULT_DOCS_PROVIDER };
