// Domain: choose the peer class for a sprint. Human-launched Claude Code
// sessions are preferred when any are connected to the channel; otherwise the
// lead spawns bounded swarm-worker subagents.

export function selectPeerClass(channelState) {
  const peers = channelState?.peers || [];
  return peers.some((p) => p.pclass === 'session') ? 'session' : 'worker';
}
