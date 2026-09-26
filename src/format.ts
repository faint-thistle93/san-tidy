// Normalizes messy chess movetext (SAN moves plus move numbers) into
// consistent PGN-style formatting, e.g. "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6".
//
// This does not validate legality or check that moves are even possible
// on a board - it only cleans up notation shape: piece-letter casing,
// castling spelling, capture marks, promotions, check/mate suffixes,
// and move numbering.
//
// Leading PGN tag pairs ("[Event \"...\"]") and "{...}"/";" comments
// are recognized and passed through untouched rather than tokenized
// as moves.

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

// A PGN tag pair, one per line at the top of a file: [Event "..."].
// These are passed through verbatim - normalizing quoting or spacing
// inside them is out of scope, this just separates them from the
// movetext that follows.
const HEADER_LINE_RE = /^\[[A-Za-z0-9_]+\s+".*"\]$/;

// Braces open a comment that runs, possibly across lines, to the next
// "}"; a semicolon opens one that runs to the end of its line. Either
// way the contents are annotator prose, not notation, so they're
// carried through unchanged rather than tokenized.
const COMMENT_RE = /\{[^}]*\}|;[^\n]*/g;

function splitHeaders(input: string): { headers: string[]; rest: string } {
  const lines = input.split(/\r?\n/);
  const headers: string[] = [];
  let i = 0;
  while (i < lines.length && HEADER_LINE_RE.test(lines[i].trim())) {
    headers.push(lines[i].trim());
    i++;
  }
  return { headers, rest: lines.slice(i).join('\n') };
}

function splitComments(input: string): { comment: boolean; text: string }[] {
  const segments: { comment: boolean; text: string }[] = [];
  let lastIndex = 0;
  for (const match of input.matchAll(COMMENT_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ comment: false, text: input.slice(lastIndex, index) });
    segments.push({ comment: true, text: match[0] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < input.length) segments.push({ comment: false, text: input.slice(lastIndex) });
  return segments;
}

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
  const { headers, rest } = splitHeaders(input);

  const out: string[] = [];
  let moveNumber = 1;
  let toMove: 'w' | 'b' = 'w';
  let seenFirstMove = false;

  for (const segment of splitComments(rest)) {
    if (segment.comment) {
      const comment = segment.text.trim();
      if (comment) out.push(comment);
      continue;
    }

    // Pull glued move-number markers apart from the move that follows
    // ("1.e4" -> "1. e4"), then collapse all whitespace so the rest of
    // this loop only has to think about single-space-separated tokens.
    const spaced = segment.text
      .replace(/(\d+\.{1,3})/g, ' $1 ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!spaced) continue;

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
  }

  const body = out.join(' ');
  if (headers.length === 0) return body;
  if (!body) return headers.join('\n');
  return headers.join('\n') + '\n\n' + body;
}
