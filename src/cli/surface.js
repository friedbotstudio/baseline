// Machine-readable description of the create-baseline CLI surface: commands,
// flags, exit codes.
//
// WHY THIS EXISTS. The public CLI reference page used to hand-type its flag
// and exit-code tables, which drifts silently: a flag lands in bin/cli.js and
// the page keeps claiming the old set. The rendered site now reads this module
// through site-src/_data/cli.cjs, so the page is generated from a declaration
// that tests/surface.test.mjs pins to the real parser.
//
// WHY bin/cli.js DOES NOT IMPORT IT. Composing HELP_TEXT from here would make
// this module load-bearing for the binary: a mistake in a description string
// could break argv parsing, and an ordinary documentation copy edit would ship
// as an npm release. Six test files sit on that parser. So OPTIONS in
// bin/cli.js stays the single runtime authority and this module is a parallel
// declaration, kept honest by set-equality assertions in the test rather than
// by a shared import. Two copies, one of them mechanically verified.
//
// DIVIDING RULE. Per-flag, per-command and per-code text lives here. Page-level
// narrative (what upgrade is FOR, how the tiers relate) lives in the .njk. A
// sentence that would read oddly inside `create-baseline --help` belongs on the
// page, not in this file.
//
// Descriptions below are taken from the behaviour in bin/cli.js,
// src/cli/install.js, src/cli/merge.js, src/cli/doctor.js and
// src/cli/plantuml.js — not from HELP_TEXT, which is prose about them.

/**
 * Command groups, in the order the reference page presents them.
 * `id` matches the positional bin/cli.js dispatches on, except `install`,
 * which is the default path taken when positionals[0] is not a subcommand.
 */
export const COMMANDS = Object.freeze([
  Object.freeze({
    id: 'install',
    usage: 'create-baseline <target> [options]',
    summary:
      'Materialize the baseline into <target>. Refuses when any sentinel path is already present unless --force is passed. Creates the target directory when it does not exist.',
    detail:
      'Copies the template, deep-merges .mcp.json, appends any missing baseline patterns to .gitignore, writes the install manifest, and mirrors the shipped tree to .claude/.baseline-prior/ for later upgrades to diff against.',
  }),
  Object.freeze({
    id: 'upgrade',
    usage: 'create-baseline upgrade [target]',
    summary:
      'Reconcile an installed target against a newer template with a three-tier merge. Requires .claude/.baseline-manifest.json; exits 2 without one.',
    detail:
      'Prunes baseline files removed upstream that you had not touched. When the target manifest already records this CLI version and nothing is staged, it prints "already on baseline X.Y.Z; nothing to do" and exits 0 without writing.',
  }),
  Object.freeze({
    id: 'doctor',
    usage: 'create-baseline doctor [target]',
    summary:
      'Report drift between an installed target and its install snapshot, counting matched, customized, missing and added files. Read-only.',
    detail:
      'Exit 0 when nothing is missing, 1 when any baseline file is missing, 2 when there is no manifest to compare against.',
  }),
]);

/**
 * Every key of the parseArgs OPTIONS object in bin/cli.js.
 *
 * `id` is the OPTIONS key verbatim — that equality is asserted, so this is the
 * join key between the docs and the parser. `group` orders the rendered page.
 */
export const FLAGS = Object.freeze([
  Object.freeze({
    id: 'force',
    cli: '--force',
    type: 'boolean',
    short: null,
    group: 'install',
    appliesTo: ['install'],
    summary:
      'Overwrite an existing install instead of refusing. Prompts for the literal word "overwrite" and requires an interactive terminal; without a TTY it exits 2 rather than proceeding unattended.',
    note:
      'Preserves .claude/workflows.jsonl, the workflow-track schema, and the two runtime memory files regardless.',
  }),
  Object.freeze({
    id: 'dry-run',
    cli: '--dry-run',
    type: 'boolean',
    short: null,
    group: 'install',
    appliesTo: ['install', 'upgrade'],
    summary: 'Print the intended actions and write nothing.',
    note: null,
  }),
  Object.freeze({
    id: 'with-npmrc',
    cli: '--with-npmrc',
    type: 'boolean',
    short: null,
    group: 'posture',
    appliesTo: ['install'],
    summary:
      'Materialize a hardened target/.npmrc carrying ignore-scripts=true and min-release-age=7. Off by default.',
    note:
      'An existing target/.npmrc is preserved verbatim. Operators who already set these in ~/.npmrc do not need the flag.',
  }),
  Object.freeze({
    id: 'no-ci-posture',
    cli: '--no-ci-posture',
    type: 'boolean',
    short: null,
    group: 'posture',
    appliesTo: ['install'],
    summary:
      'Skip the CI and secrets posture: the gitleaks pre-commit gate, the scripts/ci helpers, and the branch-protection config template. On by default.',
    note:
      'Also sets ci_posture.enabled false in the delivered project.json, so the opt-out survives upgrades instead of being re-delivered.',
  }),
  Object.freeze({
    id: 'no-plantuml',
    cli: '--no-plantuml',
    type: 'boolean',
    short: null,
    group: 'plantuml',
    appliesTo: ['install'],
    summary: 'Skip both the jar download and the Java preflight.',
    note: 'Conflicts with --require-plantuml; passing both exits 2.',
  }),
  Object.freeze({
    id: 'require-plantuml',
    cli: '--require-plantuml',
    type: 'boolean',
    short: null,
    group: 'plantuml',
    appliesTo: ['install'],
    summary:
      'Treat a failed jar fetch, a sha256 mismatch, or a missing Java as fatal and exit 4. Without it these warn and the install continues.',
    note: 'Conflicts with --no-plantuml; passing both exits 2.',
  }),
  Object.freeze({
    id: 'strict',
    cli: '--strict',
    type: 'boolean',
    short: null,
    group: 'doctor',
    appliesTo: ['doctor'],
    summary:
      'Promote customized files to exit 1 and prefix each with TAMPERED: plus its shipped and observed sha256.',
    note: 'Intended for detecting post-install tampering of the baseline tree.',
  }),
  Object.freeze({
    id: 'json',
    cli: '--json',
    type: 'boolean',
    short: null,
    group: 'doctor',
    appliesTo: ['doctor'],
    summary:
      'Emit the structured report on stdout instead of the text renderer. Honours --strict and uses the same exit codes.',
    note: null,
  }),
  Object.freeze({
    id: 'help',
    cli: '--help',
    type: 'boolean',
    short: 'h',
    group: 'misc',
    appliesTo: ['install', 'upgrade', 'doctor'],
    summary: 'Print usage and exit 0.',
    note: null,
  }),
  Object.freeze({
    id: 'version',
    cli: '--version',
    type: 'boolean',
    short: null,
    group: 'misc',
    appliesTo: ['install', 'upgrade', 'doctor'],
    summary: 'Print the CLI version and exit 0.',
    note: null,
  }),
]);

/** Human-readable labels for the FLAGS `group` values, in page order. */
export const FLAG_GROUPS = Object.freeze([
  Object.freeze({ id: 'install', label: 'install behaviour' }),
  Object.freeze({ id: 'posture', label: 'security posture' }),
  Object.freeze({ id: 'plantuml', label: 'PlantUML jar' }),
  Object.freeze({ id: 'doctor', label: 'doctor output' }),
  Object.freeze({ id: 'misc', label: 'misc' }),
]);

/**
 * Every code the CLI can return, contiguous from 0.
 *
 * Codes 3, 4 and 5 also arise inside src/cli/merge.js → computeExitCode(),
 * which is why exit 3 appears nowhere as a `return 3` in bin/cli.js.
 */
export const EXIT_CODES = Object.freeze([
  Object.freeze({
    code: 0,
    meaning: 'Success, or a doctor run that found nothing missing.',
  }),
  Object.freeze({
    code: 1,
    meaning:
      'User abort, a conflict without --force, a doctor run reporting missing files, or an aborted upgrade.',
  }),
  Object.freeze({
    code: 2,
    meaning:
      'Bad command line, input needed but no terminal attached, doctor found no manifest, or the removed --merge flag was passed.',
  }),
  Object.freeze({
    code: 3,
    meaning:
      'Upgrade kept your customized files, or preserved files that were removed upstream.',
  }),
  Object.freeze({
    code: 4,
    meaning:
      'Under --require-plantuml, the jar fetch or Java preflight failed; or a mechanical merge produced conflicts to resolve.',
  }),
  Object.freeze({
    code: 5,
    meaning:
      'A semantic merge was staged for the /upgrade-project skill to reconcile inside Claude Code.',
  }),
]);
