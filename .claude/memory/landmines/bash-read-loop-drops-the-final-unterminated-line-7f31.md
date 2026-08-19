---
key: bash-read-loop-drops-the-final-unterminated-line-7f31
category: landmines
scope: [implement, integrate]
source: assistant-deferral
raised-on: 2026-08-12
raised-in-context: consumer-install-defects
verified-at: 69c3259
last-touched: 2026-08-19
governs: scripts/build-template.sh
---

- Path: `scripts/build-template.sh` — the derived memory shard-exclude loop.
- Trap: `while IFS= read -r x; do ... done < <(producer)` silently **drops the final line** when the producer emits no trailing newline. `read` returns non-zero on an unterminated last line, so the loop body never runs for it. Measured here: the loop derived 7 of 8 memory categories because `constraints` sorts LAST in `CANONICAL`, and the build cheerfully printed `excluding 7 canonical memory shard dirs`. The off-by-one it produced was the exact defect the derivation had just been written to remove.
- Mitigation: `while IFS= read -r x || [ -n "$x" ]; do` AND have the producer emit the trailing newline (`.join("\n") + "\n"`). Either alone fixes it; both together survive someone editing one side.
- **Why the tests did not catch it, which is the transferable part.** Two tests covered this derivation and both stayed green: one ran the node expression and compared its output to `CANONICAL`, the other asserted the shell script contains no hardcoded category literal. Neither crossed the node-to-bash seam, so the bug lived exactly between them. The OUTCOME test — `checkMemoryShape` over the built tree — is what failed. When a value crosses a language boundary, test the far side's observable result, not both near sides.
- Related: [[delta-touched-splits-on-commas-not-json-9c22]] is the same family — a shell-boundary quoting/splitting assumption that produces a plausible-looking wrong answer rather than an error.
