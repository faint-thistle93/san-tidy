# san-tidy

Chess movetext copy-pasted from forums, apps, and old databases is
rarely consistent. The moves themselves are usually fine, but the
formatting around them is not:

```
1.e4 e5 2. Nf3 Nc6 3.bb5 a6 4. o-o nf6 5.re1 b5 6.bb3 O-O 7.c3 d6
```

Piece letters get lowercased, castling shows up as `o-o` or `0-0`,
capture marks and promotions are typed inconsistently, and move
numbers are glued to the move that follows or missing periods
altogether. `san-tidy` cleans that up without needing a board or move
validator - it only normalizes the shape of the notation.

```ts
import { normalizeMovetext } from './src';

const clean = normalizeMovetext(
  '1.e4 e5 2. Nf3 Nc6 3.bb5 a6 4. o-o nf6 5.re1 b5 6.bb3 O-O 7.c3 d6',
);

console.log(clean);
// "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. O-O Nf6 5. Re1 b5 6. Bb3 O-O 7. c3 d6"
```

It also handles promotions, checks, and mid-game excerpts that start
on a black move:

```ts
normalizeMovetext('e8q+');
// "e8=Q+"

normalizeMovetext('5... nf6 6.bc4');
// "5... Nf6 6. Bc4"
```

## What it fixes

- Piece-letter casing (`nf3` -> `Nf3`)
- Castling spelling (`o-o`, `0-0-0` -> `O-O`, `O-O-O`)
- Capture marks, always lowercase `x`
- Promotions written as `e8Q`, `e8/Q`, or `e8=q` -> `e8=Q`
- Check (`+`) and mate (`#`) suffixes, deduplicated and stripped of
  stray annotation glyphs (`!`, `?`)
- Move numbering, regenerated from the first number seen so a typo or
  gap later in the input can't throw off the rest of the output

It does not validate that a move is legal, or even that the piece
named can reach the destination square - that requires a board model,
which is out of scope here.

## Usage

There's no published package yet; clone the repo and build it with
the TypeScript compiler:

```
npm install
npm run build
```

`normalizeMovetext` takes an options object as a second, optional
argument. By default, tokens it doesn't recognize as a move, a move
number, or a game result are passed through unchanged. Pass
`{ strict: true }` to throw a `NotationError` on the first
unrecognized token instead.

## License

MIT, see [LICENSE](LICENSE).
