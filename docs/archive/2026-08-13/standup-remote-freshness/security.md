# Security reports — standup-remote-freshness

## standup-remote-freshness-2026-08-13.md

# Security Review — standup-remote-freshness — 2026-08-13

## Summary

Overall risk: **LOW**. No CRITICAL or HIGH findings. Covers both passes: the original change, and the pass-2 amendment (AC-010, AC-011) reviewed under **Pass 2 delta review** below. The change introduces the first outbound network call in `.claude/skills/standup/` and a new trust boundary — `git ls-remote` output is attacker-influenced whenever the remote is hostile or the transport is MITM'd. Every claim below was verified by execution against real git repositories, not by reading the code. The two structural defenses (`shell` at its default `false`, and an anchored semver filter applied before any comparison) both hold on every path. Three LOW findings are recorded, two of which are latent hazards for the next maintainer rather than live defects.

## What was checked

| # | Concern | Method | Result |
|---|---|---|---|
| 1 | Command injection via ref names | Live fixture: hostile refs written directly into a bare repo, sentinel file asserted absent | No shell involved; no execution |
| 2 | `remoteTag` output sanitisation | Regex bypass battery incl. trailing-newline anchors | Provably constrained |
| 3 | `remoteHead` unvalidated sha | Malformed object id injected into `packed-refs` | git rejects it upstream |
| 4 | ReDoS + `maxBuffer` | 25 000 refs (2.39 MB) through the real probe | Fail-safe throw, no truncation |
| 5 | Hang / resource exhaustion | Reviewed `timeout` + `killSignal` semantics | Bound is real |
| 6 | `--root` path handling | Compared against pre-change behaviour | Pre-existing, unchanged |
| 7 | Credential leakage on probe failure | Credentialed URL in remote config, error object inspected | No leak, two independent reasons |
| 8 | SSRF | Design review | By-design, user's own config |

## Findings

### [LOW] A hostile remote can suppress the staleness signal by advertising more than 1 MB of refs

- **OWASP**: A08 – Software and Data Integrity Failures | **CWE**: CWE-400 (Uncontrolled Resource Consumption)
- **File**: `.claude/skills/standup/gather.mjs:373-385`
- **Evidence**:
  ```js
  function probeGit(rootDir, args) {
    try {
      return execFileSync('git', args, {
        cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
        timeout: PROBE_TIMEOUT_MS, killSignal: 'SIGKILL',
      }).trim();
    } catch { return null; }
  }
  ```
  Measured: a bare repo advertising 25 000 refs emits 2 388 890 bytes. `execFileSync` inherits Node's default `maxBuffer` of 1 048 576 and threw `ENOBUFS`; `probeGit` returned `null`, yielding `remote-probe-failed`.
- **Impact**: The probe reports "could not check" rather than a freshness verdict. **No silent truncation** — a partial ref list never reaches the comparator, which is the outcome that would actually matter. Practical ceiling is roughly 11 000–17 000 refs depending on name length, halved again when tags are annotated (each advertises a `^{}` peel line). A hostile remote gains nothing it did not already have: a remote that can choose its advertisement can equally advertise a stale tag and lie directly. The realistic victim is a legitimate repository with a very large tag count, which would silently lose the feature.
- **Recommendation**: Set an explicit `maxBuffer` (e.g. 16 MB) on `probeGit` so the ceiling is a decision rather than an inherited default, and treat `ENOBUFS` as its own `reason` class (`remote-too-large`) so the operator can tell a big repo from an unreachable one. Not urgent — the current behaviour is already fail-safe.

### [LOW] `remoteHead` is emitted to `--json` without local validation

- **OWASP**: A03 – Injection (defense-in-depth) | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `.claude/skills/standup/gather.mjs` — `firstSha`, and the `diverged` return of `compareHead`
- **Evidence**:
  ```js
  function firstSha(lsRemoteOut) {
    const [sha] = splitOnTab(lsRemoteOut.split('\n')[0] ?? '');
    return sha || null;
  }
  // compareHead, diverged branch:
  return { state: 'diverged', sha: remoteSha };
  ```
  Unlike `remoteTag`, this value never passes a format check before landing in `release.remote.remoteHead` and the `--json` output. Pass 2 restructured how it is reached — the value now flows through an explicit `diverged` state rather than a sha-versus-null test — but `firstSha` itself is untouched and the value is still unvalidated, so the finding stands unchanged in substance.
- **Impact**: Currently none. Verified: writing `deadbeef refs/heads/evil2` into a bare repo's `packed-refs` makes git itself abort the listing (`fatal: unexpected line in ./packed-refs`, exit 128), so a malformed object id never reaches stdout. The safety therefore rests on **git's** parser, not on this code. `remoteHead` is compared only for equality and is never rendered into the terminal line, so even an unvalidated value has no injection sink today. The exposure would open if a future consumer interpolated it somewhere sink-sensitive.
- **Recommendation**: Filter through `/^[0-9a-f]{40}$/` (or `{64}` for SHA-256 repos) in `firstSha`, matching the discipline `parseSemverTag` already applies to tags. One line, and it removes the dependency on an external parser's strictness.

### [LOW] Latent credential-leak hazard if a future change propagates the caught error

- **OWASP**: A09 – Security Logging and Monitoring Failures | **CWE**: CWE-532 (Insertion of Sensitive Information into Log File)
- **File**: `.claude/skills/standup/gather.mjs:382-384`, `:140-143`
- **Evidence**: Measured with `origin` set to `https://x-access-token:SUPERSECRETTOKEN@127.0.0.1:1/o/r.git`:
  ```
  token in err.message? false
  token in err.stderr?  false
  err.message: "Command failed: git ls-remote --tags origin\nfatal: unable to access 'https://127.0.0.1:1/o/r.git/': ..."
  ```
  Compare the same probe with the **URL** passed as an argv instead of the remote name:
  ```
  err.message: "Command failed: git ls-remote --tags https://x-access-token:SUPERSECRETTOKEN@127.0.0.1:1/owner/repo.git"
  ```
- **Impact**: No leak in the current code, protected twice over. First, the probe passes the remote **name** (`origin`), never the URL, so the credential never enters `argv` — and Node builds `err.message` from the command line. Second, git redacts credentials from its own stderr. Third, the `catch {}` discards the error object wholesale, and `reason` is a fixed string literal (`'remote-unreachable'` / `'head-unreachable'`). The hazard is that all three protections are invisible at the call site: a maintainer adding `reason: err.message` for debuggability — an entirely natural improvement — reintroduces the leak the moment anyone probes by URL.
- **Recommendation**: Add a why-comment at the `catch` naming the constraint: the error object is discarded deliberately because it can carry a credentialed remote URL, and `reason` must stay a closed set of literals.

## Verified secure (enumerated, not assumed)

- **Command injection — clean.** `execFileSync('git', [args], …)` with `shell` at its default `false`. Ref text is stdout to be parsed; it never becomes `argv` and no shell is spawned. Confirmed by live test: a ref named `v0.0.9;>/abs/sentinel`, written directly into the bare repo (git's own `git tag` rejects names containing spaces, but a server is not bound by the client's rule), produced no sentinel file. `tests/standup-remote-freshness.test.mjs` asserts the probe actually ran first, so the assertion is not vacuous.
- **`remoteTag` output — provably constrained.** `newestSemverTag` assigns `name` only when `parseSemverTag(name)` returns non-null, and `SEMVER_TAG = /^v?(\d+)\.(\d+)\.(\d+)$/` is anchored at both ends. JavaScript's `$` — unlike Perl's or Python's — does **not** match before a trailing newline; verified that `"v1.2.3\n"`, `"v1.2.3\nrm -rf"`, `"v1.2.3;id"`, `"v1.2.3 x"`, and `"\nv1.2.3"` are all rejected. Only `/^v?\d+\.\d+\.\d+$/` can reach `remoteTag`, on both the stale and non-stale branches; where no tag parses, the field is `null` and `freshnessLine` guards the interpolation.
- **ReDoS — not applicable.** `SEMVER_TAG` has no nested quantifiers, no overlapping alternation, and each `\d+` is separated by a literal `\.`; matching is linear. `/\^\{\}$/` and `indexOf` are likewise linear. Per-ref cost is bounded and total refs are bounded by the `maxBuffer` ceiling above.
- **Hang bound — real.** `timeout: 30_000` with `killSignal: 'SIGKILL'`. Node's documentation notes that `execFileSync` keeps waiting for a child that ignores the termination signal; `SIGKILL` cannot be caught or ignored, so the bound holds even against a `git` wedged on a TCP connect. Choosing `SIGTERM` (the default) would have made the timeout advisory only.
- **No new dependencies.** The diff adds no `package.json` entry and no import beyond Node builtins already in the file. `npm audit --omit=dev` reports 0 vulnerabilities.

## Pass 2 delta review

The spec was amended after this review first ran (AC-010, AC-011) and the code changed accordingly. The trust boundary did **not** move: the probe still runs the same two `git ls-remote` invocations through the same `probeGit`, and no new external input reaches the process. What changed is how the head comparison's *outcome* is represented. Re-checked, with the verdict unchanged at **LOW**.

| Delta | Check | Result |
|---|---|---|
| `headState` is a new `--json` field | Can attacker-controlled text reach it? | **No.** Every assignment is a string literal: `notComparable()` returns `'not-comparable'`, and `compareHead` returns `'unreachable'`, `'matched'`, `'diverged'` inline; `probeFailed` sets `'unreachable'`. No remote-derived value is ever assigned. This is the deliberate opposite of `remoteHead`, which is remote-derived and carries the LOW finding above. |
| `fetchRemedy(remote)` | Does it interpolate remote text? | **No.** It returns one of two hardcoded literals and reads `remote.remoteTag` only as a truthiness test. The only interpolation of remote-derived text in `freshnessLine` is still `remote.remoteTag` in the stale branch, already proven constrained by the anchored `SEMVER_TAG` regex. |
| `not-comparable` render branch | Interpolation? | **None.** Fixed literal string. |
| `probeFailed` gained a field | Is the new value error-derived? | **No.** `headState: 'unreachable'` is a literal. `reason` remains the caller-supplied class string, never the caught error — the credential-leak landmine below is unchanged, and unchanged in its reasoning. |
| `probeGit` / `maxBuffer` path | Affected by the restructure? | **No.** `probeGit` is byte-identical. The ENOBUFS fail-safe still routes through `probeFailed`, which now additionally stamps a literal `headState`. |
| `firstSha` / `remoteHead` | Validation changed? | **No.** `firstSha` is untouched; only the branch that carries its output was renamed. Finding text updated above to match. |

One property worth stating because pass 2 makes it load-bearing: `not-comparable` is reported when there is nothing to compare, and it is **not** reported as a match. A verdict that overstated what was verified would be an integrity defect (A08) rather than a cosmetic one, since an operator acts on it. The four-state split is what makes that distinction expressible.

## Dependencies

None added. `node:child_process` (already imported for `gitOut`) is the only module the new code uses.

## Out of scope / Noted

- **`--root` is pre-existing.** `probeGit` takes `rootDir` from the same `flags.root ?? root` value `gitOut` has always used, so pointing `--root` elsewhere runs git in that directory exactly as before. The probe adds a network call to that surface but no new path-resolution authority. Not a regression; the operator directing their own developer CLI at their own directory is the intended use.
- **SSRF is by design and bounded.** `--remote` contacts whatever the repository's own `origin` says. There is no attacker-supplied URL parameter — the destination comes from the user's git config, the flag is opt-in, and the method is read-only (`ls-remote` fetches no objects and mutates no ref). This is a developer CLI acting on its own repository, not a server proxying user input.
- **The default path is unchanged.** With `remote` absent, no probe runs and no socket opens; `memory_session_start` and every other in-process caller keep their current behaviour exactly.
- **Not reviewed** (pre-existing, outside this diff): `.claude/memory/backlog/derive-the-memory-census-literals-or-gate-them-at-write-time.md`, `.claude/memory/conventions/anti-drift-tests-compare-against-the-live-oracle-b4d2.md`, `docs/audits/swarm-first-production-run-2026-08-09.md`.

