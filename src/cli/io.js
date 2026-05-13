import { createInterface } from 'node:readline/promises';

export function log(msg) {
  process.stdout.write(msg + '\n');
}

export function warn(msg) {
  process.stderr.write('Warning: ' + msg + '\n');
}

export function error(msg) {
  process.stderr.write('Error: ' + msg + '\n');
}

export const isTTY = !!process.stdin.isTTY;

export async function ask(prompt, opts = {}) {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(prompt);
    return answer.replace(/\r?\n$/, '');
  } finally {
    rl.close();
  }
}
