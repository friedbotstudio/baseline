// Foundation: NDJSON framing over a byte stream. encodeFrame appends the single
// frame delimiter; createDecoder reassembles partial reads, splits multi-frame
// chunks, caps line length (DoS guard for a never-terminated flood), and rejects a
// malformed line via onError WITHOUT tearing the stream (the next valid frame still
// parses). JSON.stringify escapes any payload newline, so the only raw \n is the
// delimiter. node stdlib only.

const DEFAULT_MAX_LINE = 1048576;

export function encodeFrame(msg) {
  return `${JSON.stringify(msg)}\n`;
}

export function createDecoder({ onFrame, onError, maxLineLen = DEFAULT_MAX_LINE }) {
  let buffer = '';

  function emitLine(line) {
    if (line.length === 0) return;
    if (line.length > maxLineLen) {
      onError(new Error(`frame line exceeds maxLineLen (${line.length} > ${maxLineLen})`));
      return;
    }
    try {
      onFrame(JSON.parse(line));
    } catch (err) {
      onError(err);
    }
  }

  function push(chunk) {
    buffer += chunk;
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      emitLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');
    }
    if (buffer.length > maxLineLen) {
      onError(new Error(`unterminated frame exceeds maxLineLen (${buffer.length} > ${maxLineLen})`));
      buffer = '';
    }
  }

  return { push };
}
