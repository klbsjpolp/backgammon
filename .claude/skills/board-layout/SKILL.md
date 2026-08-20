---
name: board-layout
description: Change the board's size, spacing or the page chrome around it in the web app (--pt, board-* tokens, portrait rotation, the compact landscape variant). Use when the board overflows, the checkers are too small, or anything is added to or removed from the header, status line or footer.
---

# The board's size is one number

`--pt`, the width of one point, is computed in `apps/web/src/index.css` as the largest unit that fits **both** the
width and the height the viewport still has free:

```css
--avail-w: calc(100vw - 2.75rem);
--avail-h: calc(100svh - 19rem);
--pt: clamp(1rem, min(calc(var(--avail-w) / 17), calc(var(--avail-h) / 8.6)), 2.5rem);
```

Everything else on the board is a multiple of `--pt`, declared once as `board-*` tokens in the `@theme inline` block
directly below. **Markup uses the tokens and contains no arithmetic** — `w-board-point`, `size-board-checker`,
`gap-board-gutter`. The ratios interlock (12 points + bar + tray + gutters + padding must add up to the 17 in the
width divisor; two point depths plus gutters to the 8.6), which is why they live together in one block rather than
scattered through components.

`inline` is required, not stylistic: `--pt` is declared on `.board-fit`, not `:root`, so the utilities have to carry
the expression and evaluate it where `--pt` is inherited. A plain `@theme` resolves against `:root`, where `--pt`
does not exist.

## The rule that catches everyone

**Every fixed thing on the page is paid for by the checkers.** `--avail-h` and `--avail-w` are a hand-maintained
count of the chrome — header row, status line, controls, footer, safe-area insets. If you add a row, a banner or a
line of text, subtract it there or the page starts scrolling; if you remove one, add the room back or the board
silently stays small. The reservations subtract `env(safe-area-inset-*)` where the padding they stand for does: the
page is `viewport-fit=cover`, so a board claiming its full width in landscape would otherwise claim the notch too.

Before and after any such change, check **three** cases — they are CSS-only, no resize observers, no JS breakpoints:

- **Portrait phone** (`≤640px` wide): the board is rotated a quarter turn. A board is twice as wide as it is tall,
  the worst fit for a portrait screen; rotating swaps the axes and buys ~50% larger points. `.board-label` turns the
  text back upright. Hit testing follows the transform, so clicks are unaffected.
- **Landscape phone** (the `compact` custom variant: landscape and `≤640px` tall): controls move into a column beside
  the board, primary buttons in a two-up grid, hint line dropped.
- **Anything roomier**: unchanged, `--pt` caps at 2.5rem.

## Things already tried, that are the way they are on purpose

- A checker fills 0.85 × `--pt` less the point's own border and padding, which are fixed pixels and eat a growing
  share as `--pt` shrinks. The old 0.68 was the single largest waste on the board.
- Points are 3.85 × `--pt` deep and deep stacks **overlap** rather than every point being sized for five flat
  checkers, which would cost the whole board ~20% for a case that arises on two or three points at a time.
- **How deep a stack is comes from a `data-stack` attribute the component writes**, not from `:has(> :nth-child(n))`.
  The CSS version read better and was wrong on WebKit: landing a checker did not re-evaluate it, so a point that grew
  to five kept the flat spacing and spilled past its border until something forced a full recalc. The attribute is
  invalidated by the same DOM write that changes the count, so the two cannot disagree. Do not "simplify" this back.
- **The dice are a cell of the `Controls` grid, placed per layout** — beside Roll on a roomy screen, bottom row hard
  left in portrait, a line of its own at the top of the sidebar in landscape. They are drawn as pips with the played
  ones faded, the same information as a "remaining: 6, 5" line in a third of the width. Do not try to fit them into
  the primary button row on a phone: it has 33px spare at 390px and a double needs 132. Do not solve the placement
  with one copy per breakpoint either — a hidden copy is a second `aria-label="dice"` in the tree, and the media
  query that hides it does not run in jsdom. The cell is reserved at the width of a **double** so a roll landing
  never slides the buttons sideways.
- **A die is an SVG, not the ⚀..⚅ character.** A glyph's ink is a fraction of its em box, its outline weight is the
  font's choice and so is whether the platform draws it as text or emoji, so a bigger font size bought a smudge. The
  drawn face fills its `1em` box. Sizes still come from the caller as `text-*`, and the gap between two dice is in
  `em`, so a pair keeps fitting the width the slot reserves.

## Finishing

`pnpm --filter @backgammon/web test`, then `pnpm dev` and check a portrait phone and a landscape one in devtools —
the page must fit the viewport exactly, with no scrollbar, in both. Record anything you learned the hard way in
`DECISIONS.md` under "Phone layout".
