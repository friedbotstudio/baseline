/**
 * Baseline renames — the record that lets an upgrade shed what it replaced.
 *
 * `computeMergedMcpServers` preserves any server the consumer's `.mcp.json`
 * carries that the template does not name. That rule is right for a server the
 * user added and wrong for one the baseline renamed: without this record a
 * consumer upgrading past a rename would carry BOTH the old entry (pointing at
 * a directory that no longer ships) and its replacement, forever, with no way
 * to shed the stale one short of hand-editing.
 *
 * A rename is applied only when the template actually carries `to`. A consumer
 * merging an OLDER template that still ships `from` keeps it — the replacement
 * has to exist before the thing it replaces may be dropped, or the merge would
 * strip a server the consumer still needs and leave nothing in its place.
 *
 * This file is the sole exception to the "no non-archive file names the old
 * server" rule in docs/specs/baseline-mcp.md AC-008: recording the rename is
 * what the file is for.
 */

/** @type {ReadonlyArray<{from: string, to: string, since: string}>} */
export const MCP_SERVER_RENAMES = Object.freeze([
  Object.freeze({ from: 'sprint-channel', to: 'baseline', since: '0.26.0' }),
]);

/**
 * Drop every server that a recorded rename has replaced.
 *
 * @param {Record<string, unknown>} mergedServers - servers after the ordinary merge.
 * @param {Record<string, unknown>} templateServers - servers the template declares.
 * @param {ReadonlyArray<{from: string, to: string}>} [renames] - injectable for tests.
 * @returns {Record<string, unknown>} a new object; the input is never mutated.
 */
export function applyServerRenames(mergedServers, templateServers, renames = MCP_SERVER_RENAMES) {
  if (!mergedServers || typeof mergedServers !== 'object') return {};
  const tpl = templateServers && typeof templateServers === 'object' ? templateServers : {};
  const out = { ...mergedServers };
  for (const rename of renames) {
    if (!rename || typeof rename.from !== 'string' || typeof rename.to !== 'string') continue;
    if (!(rename.to in tpl)) continue;
    delete out[rename.from];
  }
  return out;
}
