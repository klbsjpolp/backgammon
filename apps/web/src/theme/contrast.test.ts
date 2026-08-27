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

/** sRGB with the transfer function undone, which is where all the colour maths lives. */
const linear = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

const luminance = (hex: string): number => {
  const [r, g, b] = linear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** CIELAB against D65. Only `L` is used below, but the deltas need `a` and `b`. */
const lab = (hex: string): [number, number, number] => {
  const [r, g, b] = linear(hex);
  const f = (t: number): number => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

const lightness = (hex: string): number => lab(hex)[0];

/**
 * How far apart two colours look, on the scale where 1 is the smallest
 * difference anyone can see. CIEDE2000 rather than a plain distance in Lab
 * because Lab is badly non-uniform exactly where the board lives — deep browns
 * and navies — and CIE76 there over-reports by a factor of two.
 */
const difference = (first: string, second: string): number => {
  const [l1, a1, b1] = lab(first);
  const [l2, a2, b2] = lab(second);
  const chromaMean = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(chromaMean ** 7 / (chromaMean ** 7 + 25 ** 7)));
  const [ap1, ap2] = [a1, a2].map((a) => (1 + g) * a);
  const [cp1, cp2] = [Math.hypot(ap1, b1), Math.hypot(ap2, b2)];
  const angle = (b: number, a: number): number =>
    a === 0 && b === 0 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const [hp1, hp2] = [angle(b1, ap1), angle(b2, ap2)];

  const dL = l2 - l1;
  const dC = cp2 - cp1;
  let dh = cp1 * cp2 === 0 ? 0 : hp2 - hp1;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh * Math.PI) / 360);

  const lMean = (l1 + l2) / 2;
  const cMean = (cp1 + cp2) / 2;
  let hMean = (hp1 + hp2) / 2;
  if (cp1 * cp2 === 0) hMean = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) > 180) hMean += hp1 + hp2 < 360 ? 180 : -180;

  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const t =
    1 -
    0.17 * Math.cos(rad(hMean - 30)) +
    0.24 * Math.cos(rad(2 * hMean)) +
    0.32 * Math.cos(rad(3 * hMean + 6)) -
    0.2 * Math.cos(rad(4 * hMean - 63));
  const sL = 1 + (0.015 * (lMean - 50) ** 2) / Math.sqrt(20 + (lMean - 50) ** 2);
  const sC = 1 + 0.045 * cMean;
  const sH = 1 + 0.015 * cMean * t;
  const rotation =
    -2 * Math.sqrt(cMean ** 7 / (cMean ** 7 + 25 ** 7)) * Math.sin(rad(60 * Math.exp(-(((hMean - 275) / 25) ** 2))));

  return Math.sqrt((dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rotation * (dC / sC) * (dH / sH));
};

/**
 * What each kind of dichromacy leaves of a colour. The matrices are the standard
 * Viénot–Brettel–Mollon projections onto the two cone axes a dichromat still has.
 */
const CONFUSIONS = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;

const seenAs = (hex: string, kind: keyof typeof CONFUSIONS): string => {
  const rgb = linear(hex);
  return (
    '#' +
    CONFUSIONS[kind]
      .map((row) => row.reduce((sum, weight, i) => sum + weight * rgb[i], 0))
      .map((c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055))
      .map((c) =>
        Math.round(Math.min(1, Math.max(0, c)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
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

  // The dice are drawn in the rolling player's own checker colour (rim included),
  // so both have somewhere to be legible: the pips against the face they sit on,
  // and the face — or, where the face alone cannot, its rim — against the page it
  // floats on rather than the felt a checker sits on.
  it.each(['light', 'dark'])('the %s die reads against its face and the page', (side) => {
    const pip = contrast(vars[`checker-${side}-fg`], vars[`checker-${side}`]);
    expect(`checker-${side}-fg on checker-${side}: ${pip.toFixed(2)}`).toBe(
      `checker-${side}-fg on checker-${side}: ${Math.max(pip, MIN_NON_TEXT_CONTRAST).toFixed(2)}`,
    );

    const edge = Math.max(
      contrast(vars[`checker-${side}`], vars.canvas),
      contrast(vars[`checker-${side}-line`], vars.canvas),
    );
    expect(`checker-${side} on canvas: ${edge.toFixed(2)}`).toBe(
      `checker-${side} on canvas: ${Math.max(edge, MIN_NON_TEXT_CONTRAST).toFixed(2)}`,
    );
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

  /*
   * Clearing the point you are drawn on is only half of it: the rings also have
   * to be told apart from *each other*, because the point you are holding and
   * the points you can move to are on screen at the same time and mean opposite
   * things. Nothing above catches a pair that fails this — Parchment once ran
   * `--pick` and `--move` two L* apart, a brown ring and a navy one of the same
   * darkness, and every ratio in this file was green.
   *
   * `--pick` and `--pick-strong` are exempt from each other: they are one signal
   * at two strengths and are *supposed* to look related. What must separate is
   * the pick family from `--move`.
   */
  const pickFamily = ['pick', 'pick-strong'];

  // A ring is two pixels wide. The eye resolves lightness at that width far
  // better than hue, so a difference the player can rely on has to be partly a
  // difference in lightness — no amount of hue rescues two equally dark rings.
  const MIN_LIGHTNESS_STEP = 10;

  it.each(pickFamily)('--%s steps away from --move in lightness', (name) => {
    const step = Math.abs(lightness(vars[name]) - lightness(vars.move));
    expect(`${name} to move: ${step.toFixed(0)}`).toBe(
      `${name} to move: ${Math.max(step, MIN_LIGHTNESS_STEP).toFixed(0)}`,
    );
  });

  // And the hue that remains has to be a hue a dichromat still sees. Midnight
  // used to pair indigo rings with a cyan `--move`: a clear difference in
  // ordinary vision, and under simulated protanopia the same colour twice.
  //
  // The floor was 25, and 25 turned out to be a number that passes boards nobody
  // can read: Parchment sat at 30 with a `--move` so dark its hue had nowhere to
  // show, and the ring beside it still looked like the same ring. 35 is where the
  // three shipped themes actually live once each of them means something, and it
  // is the useful kind of tight — a new theme that only just clears it is a theme
  // whose `--move` has no chroma left, which is the defect itself.
  const MIN_COLOUR_BLIND_DIFFERENCE = 35;

  it.each(pickFamily)('--%s stays unlike --move for a colour-blind player', (name) => {
    for (const kind of Object.keys(CONFUSIONS) as (keyof typeof CONFUSIONS)[]) {
      const apart = difference(seenAs(vars[name], kind), seenAs(vars.move, kind));
      expect(`${name} to move under ${kind}: ${apart.toFixed(0)}`).toBe(
        `${name} to move under ${kind}: ${Math.max(apart, MIN_COLOUR_BLIND_DIFFERENCE).toFixed(0)}`,
      );
    }
  });
});
