---
name: add-theme
description: Add or edit a colour theme for the backgammon board (palette, switcher swatch, pre-paint script, WCAG contrast gate). Use when asked to add a theme, change a theme's colours, or when contrast.test.ts fails.
---

# Adding a theme

A theme is four edits and one test. It is deliberately cheap — no component names a palette colour — but the
contrast gate is real and it is where every attempt fails first, so read the last section before picking hex values.

## The four edits

1. **`apps/web/src/theme/themes.css`** — one block, `[data-theme='<id>'] { … }`, copied from an existing theme and
   recoloured. Every variable the other blocks declare must be present; a missing one silently falls through to
   Classic's `:root` copy and shows up as one wrong colour somewhere on the board. Set `color-scheme` (`dark` or
   `light`) so the UA's scrollbars and focus rings follow. Bake alpha into the value rather than leaving a `/60`
   modifier to the markup.
2. **`apps/web/src/theme/themes.ts`** — add the id to the `ThemeId` union and an entry to `THEMES` with `label`,
   `blurb` (the swatch tooltip) and `themeColor` (mobile browser chrome; mirror the block's `--canvas`).
3. **`apps/web/index.html`** — add the id and the same chrome colour to the `colors` object in the pre-paint script.
   It duplicates `themes.ts` on purpose: it has to run before any module loads, or a reload flashes Classic on its way
   to the chosen palette. The comment there says to change them together — do.
4. Nothing else. If you find yourself editing a component, the colour you want is missing from the theme layer; add a
   semantic variable to **every** block and map it in the `@theme inline` block at the bottom of `themes.css`.

## The contrast gate

`apps/web/src/theme/contrast.test.ts` reads `themes.css` off disk and holds every theme in `THEMES` to WCAG's 3:1 for
non-text UI. It runs automatically over a new theme the moment it is in the catalogue. What it checks:

- `--pick`, `--pick-strong` and `--move` each clear 3:1 against **both** `--point-even` and `--point-odd`. The two
  point colours pull in opposite directions, so a ring tuned against one usually fails the other — pick the ring
  first, then nudge the points apart until both clear. Note which direction "apart" runs: it is the _mid-toned_ point
  that squeezes the band the rings have to share, so a theme that cannot fit three separated rings usually wants its
  two points closer together, not further.
- `--pick-strong` out-**contrasts** `--pick`, which is not the same as out-brightening it. On a dark felt stronger is
  lighter; on a light one it is darker, because a mid-toned point leaves no headroom above it.
- `--move` is **at least 10 L\* away from both `--pick` and `--pick-strong`**, and **at least 25 ΔE2000 away from
  each under simulated protanopia, deuteranopia and tritanopia**. Clearing the point you sit on says nothing about
  clearing the other ring, and source and destination are on screen together. A ring is two pixels wide, so lightness
  is what it actually conveys — hue alone is not enough, and a hue two of the three dichromacies flatten is worse
  than not enough. `--pick` and `--pick-strong` are exempt from each other; they are one signal at two strengths.
  This is the constraint that decides your palette: pick `--move`'s lightness slot first, then place the pick family.
- The dice read: `--dice-pip` clears 3:1 on `--dice`, and `--dice` clears 3:1 on `--canvas`. The die is drawn, not
  typed, and has no rim — its own fill is the only thing separating it from the page, so a face at the canvas's
  luminance disappears whatever the pips do. A dark face with pale pips is as valid as the reverse; only the two
  ratios decide.
- Each checker has an edge: `max(contrast(body, point), contrast(rim, point)) >= 3` for both checkers on both points.
  A pale checker on a dark point needs no rim; a dark checker on a dark felt, or a pale one on cream, is invisible
  without one and the rim carries the ratio alone.

Run it with `pnpm --filter @backgammon/web exec vitest run src/theme/contrast.test.ts`. The failures print the actual
ratio, so iterate on the number rather than by eye.

## Finish

`pnpm --filter @backgammon/web test` (the theme tests also cover storage and the switcher), then `pnpm lint`. Check
the switcher: each swatch sets `data-theme` on itself and paints in the theme it selects, so a new theme should be
recognisable in the header without a label.
