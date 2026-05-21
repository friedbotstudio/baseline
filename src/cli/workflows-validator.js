// Orchestration — validate `.claude/workflows.jsonl` line-by-line + run
// Article IV invariant checks. Returns { ok: true, tracks } on success or
// { ok: false, errors: [...] } on any failure (parse, schema-shape, schema-
// version, or invariant violation). See docs/init/seed.md §18 for the
// full contract.

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { checkAllInvariants } from './workflows-validator-invariants.js';

const SUPPORTED_SCHEMAS = new Set(['./schemas/workflow-track.v1.json']);

const REQUIRED_TRACK_FIELDS = [
  '$schema', 'track_id', 'name', 'description', 'selectable',
  'selector_hints', 'preconditions', 'invariants', 'nodes',
];

const KNOWN_TRACK_FIELDS = new Set([...REQUIRED_TRACK_FIELDS]);

export async function validateWorkflowsJsonl(filePath) {
  const projectRoot = await findProjectRoot(filePath);
  const knownSkills = await loadKnownInvokables(projectRoot);
  const text = await readFile(filePath, 'utf8');
  const lines = text.split('\n');

  const tracks = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim().length === 0) continue;
    const parsed = tryParseJson(raw, i + 1);
    if (parsed.error) {
      return { ok: false, errors: [parsed.error] };
    }
    const shapeError = checkSchemaShape(parsed.value, i + 1);
    if (shapeError) {
      return { ok: false, errors: [shapeError] };
    }
    const versionError = checkSchemaVersion(parsed.value, i + 1);
    if (versionError) {
      return { ok: false, errors: [versionError] };
    }
    tracks.push(parsed.value);
  }

  const allTracksMap = new Map(tracks.map((t) => [t.track_id, t]));
  for (const t of tracks) {
    Object.defineProperty(t, '_allTracks', { value: allTracksMap, enumerable: false });
  }

  const invariantErrors = checkAllInvariants(tracks, { knownSkills });
  if (invariantErrors.length > 0) {
    return { ok: false, errors: invariantErrors };
  }
  return { ok: true, tracks };
}

function tryParseJson(raw, lineNo) {
  try {
    return { value: JSON.parse(raw) };
  } catch (err) {
    const colMatch = err.message.match(/position\s+(\d+)/);
    return {
      error: {
        kind: 'parse_failure',
        line: lineNo,
        col: colMatch ? parseInt(colMatch[1], 10) : 0,
        message: `Line ${lineNo}: JSON parse failed — ${err.message}`,
      },
    };
  }
}

function checkSchemaShape(track, lineNo) {
  if (track === null || typeof track !== 'object' || Array.isArray(track)) {
    return {
      kind: 'schema_shape',
      line: lineNo,
      message: `Line ${lineNo}: Track record must be a JSON object.`,
    };
  }
  for (const field of REQUIRED_TRACK_FIELDS) {
    if (!(field in track)) {
      return {
        kind: 'schema_shape',
        line: lineNo,
        track_id: track.track_id,
        message: `Line ${lineNo}: Track record missing required field '${field}'.`,
      };
    }
  }
  for (const key of Object.keys(track)) {
    if (!KNOWN_TRACK_FIELDS.has(key)) {
      return {
        kind: 'schema_shape',
        line: lineNo,
        track_id: track.track_id,
        message: `Line ${lineNo}: Track '${track.track_id}' has unknown field '${key}' (strict schema; v1 fields only).`,
      };
    }
  }
  return null;
}

function checkSchemaVersion(track, lineNo) {
  if (!SUPPORTED_SCHEMAS.has(track.$schema)) {
    return {
      kind: 'unknown_schema_version',
      line: lineNo,
      track_id: track.track_id,
      message: `Line ${lineNo}: Track '${track.track_id}' references unknown $schema='${track.$schema}'. Supported versions: ${[...SUPPORTED_SCHEMAS].join(', ')}.`,
    };
  }
  return null;
}

async function findProjectRoot(startPath) {
  let dir = resolve(startPath);
  try {
    const st = await stat(dir);
    if (!st.isDirectory()) dir = dirname(dir);
  } catch {
    dir = dirname(dir);
  }
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, '.claude/skills'))) return dir;
    dir = dirname(dir);
  }
  return dirname(startPath);
}

async function loadKnownInvokables(projectRoot) {
  // Skills live at .claude/skills/<slug>/SKILL.md (slug = directory name).
  // Commands live at .claude/commands/<slug>.md (slug = filename without .md).
  // Both surfaces are valid `skill:` references in a workflows.jsonl Track
  // node — commands are consent gates the user types; skills are Claude-
  // invokable. The Track schema does not distinguish; both resolve here.
  const known = new Set();
  const skillsDir = join(projectRoot, '.claude/skills');
  if (existsSync(skillsDir)) {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) known.add(entry.name);
    }
  }
  const commandsDir = join(projectRoot, '.claude/commands');
  if (existsSync(commandsDir)) {
    const entries = await readdir(commandsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        known.add(entry.name.slice(0, -3));
      }
    }
  }
  return known;
}
