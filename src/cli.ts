#!/usr/bin/env node
// Command-line entry point: normalizes movetext from a file argument
// or stdin and writes the result to stdout. Kept out of index.ts so
// importing the library doesn't drag process/fs into consumers who
// just want normalizeMovetext.

import { readFileSync } from 'fs';
import { normalizeMovetext, NotationError } from './format';

const USAGE =
  'usage: san-tidy [--strict] [file]\n\n' +
  'Reads movetext from FILE, or from stdin if no file is given, and\n' +
  'writes the normalized form to stdout.';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
  });
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  let strict = false;
  let file: string | null = null;

  for (const arg of args) {
    if (arg === '--strict') {
      strict = true;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE + '\n');
      return 0;
    } else if (arg.startsWith('-')) {
      process.stderr.write(`san-tidy: unknown option "${arg}"\n${USAGE}\n`);
      return 1;
    } else if (file === null) {
      file = arg;
    } else {
      process.stderr.write(`san-tidy: unexpected argument "${arg}"\n${USAGE}\n`);
      return 1;
    }
  }

  const input = file !== null ? readFileSync(file, 'utf8') : await readStdin();

  try {
    process.stdout.write(normalizeMovetext(input, { strict }) + '\n');
    return 0;
  } catch (err) {
    if (err instanceof NotationError) {
      process.stderr.write(`san-tidy: ${err.message}\n`);
      return 1;
    }
    throw err;
  }
}

main(process.argv).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`san-tidy: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
