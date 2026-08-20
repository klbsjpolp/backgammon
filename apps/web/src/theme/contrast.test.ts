import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEMES } from './themes';

// The stylesheet is the source of truth, so this reads it rather than a copy of
// the palette that could drift from it. It has to come off disk: Vitest stubs
// CSS imports, so `?raw` would hand back an empty string. The path is relative
// to the Vitest root, which is this package.
const css = readFileSync(resolve(process.cwd(), 'src/theme/themes.css'), 'utf8');

/**
 * The board's state signals — the ring around a selectable point, the selected
 * one, a legal destination — are non-text UI, so WCAG 1.4.11 wants 3:1 against
 * what they are drawn on. That is easy to get wrong by eye and easy to get wrong
 * again when a theme is added, because the two point colours pull in opposite
 * directions: a ring has to clear the pale point *and* the dark one.
 */
const MIN_NON_TEXT_CONTRAST = 3;

const variablesFor = (id: string): Record<string, string> => {
  const block = new RegExp(`\\[data-theme='${id}'\\]\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`no [data-theme='${id}'] block in themes.css`);
  return Object.fromEntries(
    [...block[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/g)].map((match) => [match[1], match[2]]),
  );
};

const luminance = (hex: string): number => {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe.each(THEMES.map((theme) => theme.id))('%s', (id) => {
  const vars = variablesFor(id);
  const points = [
    ['point-even', vars['point-even']],
    ['point-odd', vars['point-odd']],
  ] as const;

  it.each(['pick', 'pick-strong', 'move'])('--%s is legible on both point colours', (ring) => {
    for (const [name, point] of points) {
      expect(`${ring} on ${name}: ${contrast(vars[ring], point).toFixed(2)}`).toBe(
        `${ring} on ${name}: ${Math.max(contrast(vars[ring], point), MIN_NON_TEXT_CONTRAST).toFixed(2)}`,
      );
    }
  });

  // Catches the inversion a light theme invites: --pick-strong marks the point
  // you actually picked, so it cannot be the fainter of the two. On a dark board
  // that means lighter, on a light board darker, and only the ratio says which.
  it('--pick-strong reads stronger than --pick', () => {
    for (const [, point] of points) {
      expect(contrast(vars['pick-strong'], point)).toBeGreaterThan(contrast(vars.pick, point));
    }
  });

  // The dice are drawn, not typed, so a theme now picks two colours for them and
  // both have somewhere to be legible: the pips against the face they sit on, and
  // the face against the page it floats on with nothing but its own fill to draw
  // its edge. A theme that gives the die the canvas's own luminance loses the die.
  it('the dice read against their face and the page', () => {
    for (const [name, against] of [
      ['dice-pip on dice', contrast(vars['dice-pip'], vars.dice)],
      ['dice on canvas', contrast(vars.dice, vars.canvas)],
    ] as const) {
      expect(`${name}: ${against.toFixed(2)}`).toBe(`${name}: ${Math.max(against, MIN_NON_TEXT_CONTRAST).toFixed(2)}`);
    }
  });

  // Either the body or the rim has to draw the checker's edge. In the dark themes
  // the pale body does it on its own; on a light board only the rim can.
  it.each(['light', 'dark'])('the %s checker has an edge on both point colours', (side) => {
    for (const [name, point] of points) {
      const best = Math.max(contrast(vars[`checker-${side}`], point), contrast(vars[`checker-${side}-line`], point));
      expect(`checker-${side} on ${name}: ${best.toFixed(2)}`).toBe(
        `checker-${side} on ${name}: ${Math.max(best, MIN_NON_TEXT_CONTRAST).toFixed(2)}`,
      );
    }
  });
});
