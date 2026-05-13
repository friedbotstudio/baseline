import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';

let io;
try {
  io = await import('../src/cli/io.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/io.js: ${err.message}`);
}

describe('IO module', () => {
  it('log writes to stdout with trailing newline', () => {
    const captured = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { captured.push(chunk); return true; };
    try {
      io.log('hello');
    } finally {
      process.stdout.write = original;
    }
    assert.equal(captured.length, 1);
    assert.equal(captured[0], 'hello\n');
  });

  it('warn writes to stderr with \'Warning:\' prefix', () => {
    const captured = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { captured.push(chunk); return true; };
    try {
      io.warn('msg');
    } finally {
      process.stderr.write = original;
    }
    assert.equal(captured.length, 1);
    assert.ok(captured[0].startsWith('Warning: '), `expected 'Warning: ' prefix, got: ${captured[0]}`);
    assert.ok(captured[0].includes('msg'), `expected 'msg' in output, got: ${captured[0]}`);
  });

  it('error writes to stderr with \'Error:\' prefix', () => {
    const captured = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { captured.push(chunk); return true; };
    try {
      io.error('msg');
    } finally {
      process.stderr.write = original;
    }
    assert.equal(captured.length, 1);
    assert.ok(captured[0].startsWith('Error: '), `expected 'Error: ' prefix, got: ${captured[0]}`);
    assert.ok(captured[0].includes('msg'), `expected 'msg' in output, got: ${captured[0]}`);
  });

  it('isTTY mirrors process.stdin.isTTY', () => {
    assert.equal(io.isTTY, !!process.stdin.isTTY);
  });

  it('ask returns the trimmed user input', async () => {
    const input = Readable.from(['overwrite\n']);
    const output = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const answer = await io.ask('type \'overwrite\' to proceed: ', { input, output });
    assert.equal(answer, 'overwrite');
  });
});
