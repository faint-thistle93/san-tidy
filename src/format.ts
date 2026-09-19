// Normalizes messy chess movetext (SAN moves plus move numbers) into
// consistent PGN-style formatting, e.g. "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6".
//
// This does not validate legality or check that moves are even possible
// on a board - it only cleans up notation shape: piece-letter casing,
// castling spelling, capture marks, promotions, check/mate suffixes,
// and move numbering.

export interface FormatOptions {
  /**
   * When true, throw a NotationError on the first token that cannot be
   * parsed as a move, a move-number marker, or a game result. When
   * false (the default) unrecognized tokens are passed through
   * unchanged so the formatter can still do useful work on input that
   * is only partly garbled.
   */
  strict?: boolean;
}

export class NotationError extends Error {
  constructor(public readonly token: string) {
    super(`cannot parse "${token}" as chess notation`);
    this.name = 'NotationError';
  }
}

const PIECE_LETTERS = 'KQRBN';

// A non-castling SAN move: optional piece letter, optional
// disambiguating file and/or rank, optional capture mark, the
// destination square, and an optional promotion. Promotions show up
// separated by "=" or "/" ("e8=Q", "e8/Q") or not separated at all
// ("e8Q"). Suffixes (+, #) are stripped and handled separately before
// this is applied. Matching is case-insensitive so "nf3" and "NF3"
// both parse; casing is fixed up by the caller.
const MOVE_RE = new RegExp(
  `^([${PIECE_LETTERS}])?([a-h])?([1-8])?(x)?([a-h][1-8])([=/]?([${PIECE_LETTERS}]))?$`,
  'i',
);

// The letters/digits that stand in for castling once dashes and
// suffixes are removed - "O-O", "0-0", "o-o-o" all reduce to this.
const CASTLE_CORE_RE = /^[oO0](-?[oO0]){1,2}$/;

const MOVE_NUMBER_RE = /^(\d+)(\.{1,3})$/;
const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

// Strips trailing check (+), mate (#), and annotation glyphs (!, ?)
// from a token, collapsing them to a single canonical suffix. Mate
// wins over check if both somehow appear; annotation glyphs are
// dropped since they aren't part of the move itself.
function extractSuffix(token: string): { rest: string; suffix: string } {
  let end = token.length;
  let sawMate = false;
  let sawCheck = false;
  while (end > 0 && '+#!?'.includes(token[end - 1])) {
    const ch = token[end - 1];
    if (ch === '#') sawMate = true;
    if (ch === '+') sawCheck = true;
    end--;
  }
  const suffix = sawMate ? '#' : sawCheck ? '+' : '';
  return { rest: token.slice(0, end), suffix };
}

function normalizeCastling(rest: string): string | null {
  if (!CASTLE_CORE_RE.test(rest)) return null;
  const markers = rest.replace(/-/g, '').length;
  return markers >= 3 ? 'O-O-O' : 'O-O';
}

function normalizeMove(rest: string): string | null {
  const match = rest.match(MOVE_RE);
  if (!match) return null;
  const [, piece, fromFile, fromRank, capture, dest, , promo] = match;
  let out = '';
  if (piece) out += piece.toUpperCase();
  if (fromFile) out += fromFile.toLowerCase();
  if (fromRank) out += fromRank;
  if (capture) out += 'x';
  out += dest.toLowerCase();
  if (promo) out += '=' + promo.toUpperCase();
  return out;
}

function normalizeToken(token: string): string | null {
  const { rest, suffix } = extractSuffix(token);
  if (!rest) return null;
  const castled = normalizeCastling(rest);
  if (castled) return castled + suffix;
  const moved = normalizeMove(rest);
  if (moved) return moved + suffix;
  return null;
}

export function normalizeMovetext(input: string, options: FormatOptions = {}): string {
  const { strict = false } = options;

  // Pull glued move-number markers apart from the move that follows
  // ("1.e4" -> "1. e4"), then collapse all whitespace so the rest of
  // this function only has to think about single-space-separated
  // tokens.
  const spaced = input
    .replace(/(\d+\.{1,3})/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!spaced) return '';

  const out: string[] = [];
  let moveNumber = 1;
  let toMove: 'w' | 'b' = 'w';
  let seenFirstMove = false;

  for (const token of spaced.split(' ')) {
    const numberMatch = token.match(MOVE_NUMBER_RE);
    if (numberMatch) {
      // A move-number marker tells us where the excerpt starts; once
      // the first move has been placed we renumber ourselves, so a
      // wrong or missing number later in the input can't desync the
      // output.
      if (!seenFirstMove) {
        moveNumber = parseInt(numberMatch[1], 10);
        toMove = numberMatch[2].length >= 3 ? 'b' : 'w';
      }
      continue;
    }

    if (RESULT_TOKENS.has(token)) {
      out.push(token);
      continue;
    }

    const normalized = normalizeToken(token);
    if (normalized === null) {
      if (strict) throw new NotationError(token);
      out.push(token);
      if (toMove === 'w') {
        toMove = 'b';
      } else {
        moveNumber++;
        toMove = 'w';
      }
      seenFirstMove = true;
      continue;
    }

    if (toMove === 'w') {
      out.push(`${moveNumber}.`, normalized);
      toMove = 'b';
    } else {
      if (!seenFirstMove) out.push(`${moveNumber}...`, normalized);
      else out.push(normalized);
      moveNumber++;
      toMove = 'w';
    }
    seenFirstMove = true;
  }

  return out.join(' ');
}
