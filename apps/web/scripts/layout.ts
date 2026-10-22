/**
 * Opens the app at the viewports the layout has to fit, screenshots each one and
 * fails if any of them scrolls — the check the board-layout skill asks for after
 * every change to `--pt`, the `board-*` tokens or the page chrome around them.
 *
 *   pnpm --filter @backgammon/web layout
 *   pnpm --filter @backgammon/web layout --only phone --out /some/dir
 *
 * It starts its own Vite dev server, so nothing else needs to be running. Each
 * viewport is checked twice: on the opening screen, and after the first roll,
 * when the dice and the turn's controls are on the board.
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';

interface Viewport {
  name: string;
  width: number;
  height: number;
  /** Honours `<meta name="viewport">` and touch, as a phone would. */
  mobile: boolean;
}

// The phones are the cases that break: the smallest of each orientation, plus
// common modern sizes up to a Pro Max. 568 × 320 is the one DECISIONS.md measures the landscape
// sidebar against.
const VIEWPORTS: Viewport[] = [
  { name: 'phone-portrait-375x667', width: 375, height: 667, mobile: true },
  { name: 'phone-portrait-390x844', width: 390, height: 844, mobile: true },
  { name: 'phone-portrait-440x956', width: 440, height: 956, mobile: true },
  { name: 'phone-landscape-568x320', width: 568, height: 320, mobile: true },
  { name: 'phone-landscape-844x390', width: 844, height: 390, mobile: true },
  { name: 'tablet-portrait-820x1180', width: 820, height: 1180, mobile: true },
  { name: 'desktop-1440x900', width: 1440, height: 900, mobile: false },
];

// Claude Code on the web ships a Chromium here that may not match the
// installed Playwright's revision; anywhere else, `pnpm exec playwright install
// chromium` provides the one Playwright expects.
const CONTAINER_CHROMIUM = '/opt/pw-browsers/chromium';

interface Measure {
  scrollW: number;
  scrollH: number;
  innerW: number;
  innerH: number;
  /** Width of one point, untransformed, so it reads the same rotated or not. */
  point: number;
}

const measure = (page: Page): Promise<Measure> =>
  page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    const point = document.querySelector<HTMLElement>('.board-point');
    return {
      scrollW: root.scrollWidth,
      scrollH: root.scrollHeight,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      point: point?.offsetWidth ?? 0,
    };
  });

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: join(tmpdir(), 'backgammon-layout') },
      only: { type: 'string' },
    },
  });
  const out = resolve(values.out);
  await mkdir(out, { recursive: true });
  const viewports = VIEWPORTS.filter((v) => !values.only || v.name.includes(values.only));

  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { port: 0, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the dev server did not report a URL');

  const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(CONTAINER_CHROMIUM) ? CONTAINER_CHROMIUM : undefined);
  const browser = await chromium.launch({ executablePath });
  let failures = 0;
  try {
    for (const v of viewports) {
      const context = await browser.newContext({
        viewport: { width: v.width, height: v.height },
        deviceScaleFactor: 2,
        isMobile: v.mobile,
        hasTouch: v.mobile,
      });
      const page = await context.newPage();
      await page.goto(url);
      await page.locator('.board-point').first().waitFor();

      const states: [string, () => Promise<void>][] = [
        ['start', async () => {}],
        // Exact, because "Lancer auto" is a checkbox label right beside it.
        ['rolled', () => page.getByRole('button', { name: 'Lancer', exact: true }).click()],
      ];
      for (const [state, reach] of states) {
        await reach();
        // Lets the dice and any checker flight settle before the measurement.
        await page.waitForTimeout(400);
        const m = await measure(page);
        const file = join(out, `${v.name}-${state}.png`);
        await page.screenshot({ path: file });
        const overflow = m.scrollW > m.innerW || m.scrollH > m.innerH;
        if (overflow) failures++;
        const verdict = overflow ? `SCROLLS (page ${m.scrollW}×${m.scrollH})` : 'fits';
        console.info(`${overflow ? '✗' : '✓'} ${v.name} ${state}: ${verdict}, point ${m.point}px → ${file}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  if (failures > 0) {
    console.error(`${failures} layout(s) scroll; the page must fit the viewport exactly.`);
    process.exitCode = 1;
  }
};

await main();
