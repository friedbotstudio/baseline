# Security reports — workflow-loop-closing-hygiene

## workflow-loop-closing-hygiene-2026-05-17.md

# Security Review — workflow-loop-closing-hygiene — 2026-05-17

## Summary

**Overall risk: LOW.** The diff adds three small internal-tooling surfaces (a python drift-check helper, a new sweep.py mode, a bash regen script) plus SKILL.md documentation updates. No new HTTP, no new auth, no new database, no new deserialization. Two LOW findings flagged — both path-traversal / shell-quoting concerns mitigated by the trust model (the operator controls the inputs; no cross-tenant boundary is crossed). One advisory note on the `/commit` Step 6 invocation pattern.

## What was checked

- `git diff` of the branch — 11 changed files, 9 new files, ~248 insertions / ~31 deletions.
- New python source: `.claude/skills/tdd/drift_check.py` (~140 LOC).
- Extended python source: `.claude/skills/memory-flush/sweep.py` (+57 LOC, new `mode_stamp_closure` function + argparse arg).
- New bash helper: `.claude/hooks/tests/fixtures/regenerate-ac008.sh`.
- SKILL.md documentation: `tdd`, `memory-flush`, `commit`, `triage`, `harness`, `memory/README.md`.
- Regenerated fixture: `.claude/hooks/tests/fixtures/ac008_byte_equal_reference.txt` (data file, no executable content).
- Regenerated `obj/template/manifest.json` (sha256 table; no executable content).

## Findings

### [LOW] Path traversal via `--slug` argument in drift_check.py

- **OWASP**: A03 - Injection | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/tdd/drift_check.py:42` and `:67`
- **Evidence**:
  ```python
  def load_spec(project_root: Path, slug: str) -> str | None:
      spec_path = project_root / 'docs' / 'specs' / f'{slug}.md'
      ...

  def write_report(project_root: Path, slug: str, body: str) -> Path:
      ...
      out_path = out_dir / f'{slug}.md'
      out_path.write_text(body, encoding='utf-8')
  ```
- **Impact**: A `--slug` argument containing `..` segments (e.g., `../../etc/foo`) would escape the intended `docs/specs/` and `.claude/state/drift/` directories on both the read path (load_spec) and the write path (write_report). On the write side, an adversarial slug could overwrite an arbitrary file the running user can write to. On the read side, the path would still need to resolve to a file with the `.md` suffix appended, narrowing the practical surface.
- **Mitigation status**: the trust model already places this BELOW a privilege boundary — the operator is the only caller (via `/tdd`'s drift-check-tick worker step), the operator already has full filesystem access in the project root, and there is no cross-user / cross-tenant boundary. Risk is bounded to "accidentally write somewhere unexpected."
- **Recommendation**: add a slug validator at argparse-time:
  ```python
  if not re.match(r'^[A-Za-z0-9._-]+$', args.slug):
      parser.error('--slug must match [A-Za-z0-9._-]+')
  ```
  Defends against accidental traversal without changing legitimate caller behavior (slugs in this baseline are kebab-case with dashes and digits). Non-blocking — file as a follow-up backlog item.

### [LOW] Shell-quoting of `--backlog-keys` CSV when /commit invokes sweep.py

- **OWASP**: A03 - Injection | **CWE**: CWE-78 (OS Command Injection)
- **File**: `.claude/skills/commit/SKILL.md:20` (Step 6)
- **Evidence**:
  ```
  Otherwise invoke `python3 .claude/skills/memory-flush/sweep.py --mode stamp-closure --memory-dir .claude/memory --backlog-keys <comma-separated keys>`.
  ```
- **Impact**: The SKILL.md SOP names the invocation but does not require the keys CSV to be quoted as a single shell token. If Claude composes the command via the Bash tool and a backlog key contains shell metacharacters (`;`, `&&`, `$( )`, backticks), shell interpretation could execute attacker-supplied code. The keys come from `workflow.json → source_backlog_keys`, which the operator populates at `/triage` time — same trust model as Finding #1 — but the operator might paste a malformed key by accident, and an accidental `;` would silently execute something unintended.
- **Mitigation status**: low blast radius (operator is the only caller; the keys are operator-controlled). The same threat exists for any argv passed through Bash; the project's destructive_cmd_guard hook also catches the most dangerous patterns (`rm -rf /`, etc.) at the PreToolUse boundary.
- **Recommendation**: update commit/SKILL.md Step 6 to explicitly quote the CSV:
  ```
  python3 .claude/skills/memory-flush/sweep.py --mode stamp-closure --memory-dir .claude/memory --backlog-keys "<comma-separated keys>"
  ```
  And/or add a regex validator inside `sweep.py` that rejects keys not matching `^[A-Za-z0-9._-]+$`. Non-blocking; can ride along in a follow-up.

## What was checked and is safe

- **subprocess in drift_check.py**: uses list-form `subprocess.check_output(['git', '-C', str(project_root), ...])`. No `shell=True`. No string interpolation into the command line. Safe.
- **regenerate-ac008.sh**: all interpolations are quoted (`"$HOOK"`, `"$REPO_ROOT"`, `"$FIXTURE"`). `CLAUDE_PROJECT_DIR` is set explicitly from the script's own `REPO_ROOT` derivation, not from user input. The payload heredoc is a fixed literal `'{}'`. No tainted-input flow into the shell.
- **sweep.py `mode_stamp_closure` injection**: the CSV is parsed via `split(',')` and stripped; each key is compared via string equality against `## <key>` headings from `backlog.md`. A malicious key with `\n## fake-entry` content cannot inject a new entry — `_find_entry_block` returns the first matching `## <key>` block from the FILE (not the input). `update_field` uses `re.escape(name)` and hardcoded values (`picked-up`, today ISO). No reflection of attacker input into regex or file content beyond the lookup.
- **`update_field` re.sub**: the replacement value comes only from hardcoded strings (`picked-up`, today's ISO date). No backreference expansion vulnerability.
- **No new dependencies**: `package.json` is unchanged. No new Python imports beyond stdlib (argparse, re, subprocess, datetime, pathlib, sys, json).
- **No new auth/A&A surface**: no tokens, no sessions, no role checks.
- **No new crypto**: no hashing or encryption in the diff (sha256 hashes are computed by build-manifest.mjs against file contents — unchanged behavior).
- **No new deserialization**: drift_check.py reads markdown (text), parses with regex. `json.loads` is used in regenerate-ac008.sh on the hook's own JSON output — trusted source.
- **No SSRF / network egress**: no HTTP calls in the new code.
- **Secrets hygiene**: no hardcoded tokens or keys in the diff. `.env`, `.envrc`, `.pem` patterns absent.

## Dependencies

No new packages added. `package.json` unchanged. `obj/template/manifest.json` was regenerated as a sha256 manifest of the package payload — that file IS the dependency-integrity attestation per Article XI, and the audit passes.

## Out of scope / Noted

- **Article IX direct-write boundary**: `/commit` Step 6 invokes `sweep.py --mode stamp-closure` rather than writing `backlog.md` directly. The curator-not-writer pattern is preserved through the actuator. Not a security finding; design observation.
- **Slug name policy**: the project already de-facto enforces kebab-case slugs across all workflow artifacts (intake, scout, research, spec). A central slug-validator at `/triage` time (which writes `workflow.json → slug`) would mitigate Finding #1 uniformly across drift_check.py, archive.sh, and every other tool that reads/writes by slug. Out of scope for this workflow; worth a future backlog item.

## Verdict

LOW risk overall. Both findings are gated by the operator trust model and have non-blocking mitigations. Workflow proceeds to `/integrate`.

