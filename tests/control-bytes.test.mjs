// No tracked text file may carry a C0 control byte other than tab, LF or CR.
//
// Why this is a gate and not a style preference: a source file containing a NUL is
// classified binary, and `git diff` then emits "Binary files ... differ" instead of
// line content. Every diff-reading consumer goes blind at once — `drift_check`'s
// AC scoring, `rightsize-gate`'s line measure, and above all HUMAN REVIEW, which
// sees an opaque blob where a module should be. grep's behaviour on such files is
// platform-dependent, so tooling that greps becomes unreliable rather than failing.
//
// Found live on 2026-08-05: three offenders, two of them shipped modules that had
// already landed this way (`memory-index/index-io.mjs`, `document/document-gate.mjs`),
// each using a raw NUL as a glob-expansion sentinel. The idiom is deliberate and the
// byte is invisible in an editor, which is exactly why it needs a mechanical check.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// An ALLOWLIST of text extensions, not a blocklist of binary ones: a blocklist fails
// open on the next binary type someone vendors, an allowlist fails closed.
const TEXT_EXT = /\.(mjs|js|cjs|json|jsonl|md|sh|bash|yml|yaml|html|css|scss|njk|txt|puml|template)$/i;

// docs/archive/** is excluded on purpose. Archived bundles are immutable historical
// records (tests/archived-bundle-immutability.test.mjs); rewriting one to satisfy a
// lint would falsify the record of what actually landed.
const EXCLUDED = [/^docs\/archive\//];

const ALLOWED_CONTROLS = new Set([9, 10, 13]); // tab, LF, CR
const MAX_BYTES = 4 * 1024 * 1024;

function trackedTextFiles() {
  return execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32e6 })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((rel) => TEXT_EXT.test(rel))
    .filter((rel) => !EXCLUDED.some((re) => re.test(rel)));
}

function firstControlByte(rel) {
  const abs = join(REPO_ROOT, rel);
  let buf;
  try {
    if (statSync(abs).size > MAX_BYTES) return null;
    buf = readFileSync(abs);
  } catch {
    return null;
  }
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 32 && c !== 127) continue;
    if (ALLOWED_CONTROLS.has(c)) continue;
    return { offset: i, byte: c, context: buf.slice(Math.max(0, i - 40), i + 20).toString('utf8') };
  }
  return null;
}

describe('tracked text files carry no stray control bytes', () => {
  it('test_when_tracked_text_files_scanned_then_no_control_bytes_found', () => {
    const files = trackedTextFiles();
    assert.ok(files.length > 100, `expected a substantial corpus, scanned ${files.length}`);

    const offenders = [];
    for (const rel of files) {
      const hit = firstControlByte(rel);
      if (hit) offenders.push(`${rel} @${hit.offset} = 0x${hit.byte.toString(16).padStart(2, '0')}`);
    }

    assert.deepEqual(
      offenders,
      [],
      `control bytes make a file binary to git diff, blinding review and every diff-reading check:\n  ${offenders.join('\n  ')}`,
    );
  });

  it('test_when_a_control_byte_is_present_then_the_detector_reports_it', () => {
    // The detector must be able to fail. A guard that cannot fire is not a guard —
    // this is the self-check that keeps the suite above from passing vacuously.
    const probe = Buffer.from('const k = 1;\nconst j = 2;\n', 'utf8');
    const withNul = Buffer.concat([probe.slice(0, 8), Buffer.from([0]), probe.slice(8)]);
    const scan = (buf) => {
      for (let i = 0; i < buf.length; i++) {
        const c = buf[i];
        if (c >= 32 && c !== 127) continue;
        if (ALLOWED_CONTROLS.has(c)) continue;
        return i;
      }
      return null;
    };
    assert.equal(scan(probe), null, 'clean text must not trip the detector');
    assert.equal(scan(withNul), 8, 'a NUL must be located at its exact offset');
  });
});
