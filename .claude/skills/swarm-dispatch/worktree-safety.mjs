// worktree-safety — D1 of swarm-mode-first-run-hardening (-e3f2).
//
// The worktree base commit is chosen by the Agent tool's isolation:"worktree",
// not by baseline — observed forking from a stale ref (17 behind HEAD) on the
// first real swarm run. So baseline cannot make multi-wave worktree dispatch
// correct; it can only REFUSE it and steer to shared mode, and detect a
// baseline_ref that disagrees with the worktree's real merge-base. This is the
// mechanical half of the documented "worktree = single-wave only" constraint
// (see swarm-dispatch/SKILL.md). Pure policy: never throws.

export function assertWorktreeWaveSafety({ isolation, waves, baselineRef, worktreeBase } = {}) {
  if (isolation !== 'worktree') return { ok: true, reason: '' };

  if (Array.isArray(waves) && waves.length > 1) {
    return {
      ok: false,
      reason: 'multi-wave dispatch is unsupported under worktree isolation (worktree base is Agent-tool-owned); use shared isolation',
    };
  }

  if (baselineRef && worktreeBase && baselineRef !== worktreeBase) {
    return {
      ok: false,
      reason: `baseline_ref (${baselineRef}) != worktree merge-base (${worktreeBase})`,
    };
  }

  return { ok: true, reason: '' };
}
