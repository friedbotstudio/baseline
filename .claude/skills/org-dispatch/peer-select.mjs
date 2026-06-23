// Domain: choose the peer class for an org run. Human-launched Claude Code sessions
// (the flat 4-peer pod) are preferred when any are connected to the channel; otherwise
// the lead spawns bounded swarm-worker subagents as a fallback execution surface.

export function selectPeerClass(channelState) {
  const peers = channelState?.peers || [];
  return peers.some((p) => p.pclass === 'session') ? 'session' : 'worker';
}
