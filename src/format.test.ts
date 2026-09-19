// Hand-rolled test runner. The library's whole pitch is zero
// dependencies, and this tsconfig doesn't even pull in @types/node,
// so reaching for a test framework (or node:test's types) for a
// couple dozen assertions felt like the wrong trade. Each check
// records a pass or a labeled failure; the run ends by throwing if
// anything failed, which is enough for `node dist/format.test.js` to
// exit non-zero.

declare const console: { log(message: string): void };

import { normalizeMovetext, NotationError } from './format';

let passed = 0;
const failures: string[] = [];

function check(name: string, run: () => void): void {
  try {
    run();
    passed++;
  } catch (err) {
    failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assertEqual(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

check('README example', () => {
  assertEqual(
    normalizeMovetext('1.e4 e5 2. Nf3 Nc6 3.bb5 a6 4. o-o nf6 5.re1 b5 6.bb3 O-O 7.c3 d6'),
    '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. O-O Nf6 5. Re1 b5 6. Bb3 O-O 7. c3 d6',
  );
});

check('promotions', () => {
  assertEqual(normalizeMovetext('e8Q'), '1. e8=Q');
  assertEqual(normalizeMovetext('e8/Q'), '1. e8=Q');
  assertEqual(normalizeMovetext('e8=q'), '1. e8=Q');
  assertEqual(normalizeMovetext('exf8=n'), '1. exf8=N');
  assertEqual(normalizeMovetext('e8q+'), '1. e8=Q+');
  assertEqual(normalizeMovetext('e8q#'), '1. e8=Q#');
});

check('castling, all spellings and both sides', () => {
  for (const kingside of ['O-O', 'o-o', '0-0']) {
    assertEqual(normalizeMovetext(kingside), '1. O-O');
  }
  for (const queenside of ['O-O-O', 'o-o-o', '0-0-0']) {
    assertEqual(normalizeMovetext(queenside), '1. O-O-O');
  }
  assertEqual(normalizeMovetext('o-o+'), '1. O-O+');
  assertEqual(normalizeMovetext('0-0-0#'), '1. O-O-O#');
});

check('mid-game excerpt starting on a black move', () => {
  assertEqual(normalizeMovetext('5... nf6 6.bc4'), '5... Nf6 6. Bc4');
});

check('disambiguated moves keep file/rank markers and fix casing', () => {
  assertEqual(normalizeMovetext('nbd7'), '1. Nbd7');
  assertEqual(normalizeMovetext('r1a3'), '1. R1a3');
  assertEqual(normalizeMovetext('Rdf8+'), '1. Rdf8+');
});

check('captures and check/mate suffixes', () => {
  assertEqual(normalizeMovetext('Qxf7#'), '1. Qxf7#');
  assertEqual(normalizeMovetext('bxc3'), '1. bxc3');
});

check('renumbers moves regardless of gaps or typos in the input', () => {
  assertEqual(normalizeMovetext('1. e4 e5 9. Nf3 Nc6'), '1. e4 e5 2. Nf3 Nc6');
});

check('game result tokens pass through at the end', () => {
  assertEqual(
    normalizeMovetext('1. e4 e5 2. Qh5 Nc6 3. Qxf7# 1-0'),
    '1. e4 e5 2. Qh5 Nc6 3. Qxf7# 1-0',
  );
});

check('non-strict mode passes unrecognized tokens through unchanged', () => {
  assertEqual(normalizeMovetext('1. e4 e5 2. garbage Nc6'), '1. e4 e5 2. garbage Nc6');
});

check('strict mode throws NotationError on the first unrecognized token', () => {
  let caught: unknown;
  try {
    normalizeMovetext('1. e4 e5 2. garbage Nc6', { strict: true });
  } catch (err) {
    caught = err;
  }
  if (!(caught instanceof NotationError) || caught.token !== 'garbage') {
    throw new Error(`expected a NotationError for "garbage", got ${String(caught)}`);
  }
});

check('empty input normalizes to an empty string', () => {
  assertEqual(normalizeMovetext(''), '');
  assertEqual(normalizeMovetext('   '), '');
});

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  throw new Error(`test failures:\n${failures.join('\n')}`);
}
