import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { fetchRuntimeConfig } from '@/lib/runtimeConfig';
import { App } from '@/App';

vi.mock('@/lib/appVersion', () => ({ APP_VERSION: 'v1.2.3' }));
vi.mock('@/lib/reload', () => ({ reloadApp: vi.fn() }));
vi.mock('@/lib/runtimeConfig', () => ({ fetchRuntimeConfig: vi.fn() }));

const fetchRuntimeConfigMock = vi.mocked(fetchRuntimeConfig);

/** A roomy screen, so the header offers its slot — see `useRoomyScreen`. */
const setRoomy = () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
};

/** Enough of the Fullscreen API for the toggle to work — jsdom has none. */
const installFullscreenApi = () => {
  let element: Element | null = null;
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
  Object.defineProperty(document, 'fullscreenElement', { get: () => element, configurable: true });
  document.documentElement.requestFullscreen = vi.fn(() => {
    element = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  document.exitFullscreen = vi.fn(() => {
    element = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
};

const enterFullscreen = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }));
  });
};

/** The element the board's own unit lives on, and so the band's only valid home. */
const boardFit = (): HTMLElement => document.querySelector('.board-fit') as HTMLElement;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  fetchRuntimeConfigMock.mockResolvedValue({ appVersion: 'v1.2.3' });
  setRoomy();
  installFullscreenApi();
});

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  Reflect.deleteProperty(document, 'fullscreenElement');
  document.body.removeAttribute('data-fullscreen');
  vi.restoreAllMocks();
});

describe('the fullscreen layout', () => {
  it('draws the controls and the status inside the board, not around it', async () => {
    render(<App />);

    // Windowed, both are outside the board — that is the layout every other test sees.
    expect(boardFit().contains(screen.getByRole('button', { name: /^lancer$/i }))).toBe(false);

    await enterFullscreen();

    expect(boardFit().contains(screen.getByRole('button', { name: /^lancer$/i }))).toBe(true);
    expect(boardFit().contains(screen.getByRole('checkbox', { name: 'Lancer auto' }))).toBe(true);
    expect(boardFit().contains(screen.getByText(/doit lancer/i, { ignore: '.sr-only' }))).toBe(true);
  });

  it('leaves one row outside the board, with the version line on it', async () => {
    render(<App />);

    // Re-queried on each side of the switch, never held across it: the line is
    // one element *moved*, so React unmounts the old node and the stale
    // reference would answer about a row nothing is in any more.
    const titleRow = () => screen.getByRole('heading', { name: /backgammon/i }).parentElement?.parentElement;

    // Windowed: the version is a footer, nowhere near the title's row.
    expect(titleRow()?.contains(screen.getByTestId('app-version'))).toBe(false);

    await enterFullscreen();

    // The row that holds the title now holds the version too, so the board is
    // the only other thing on the page.
    expect(titleRow()?.contains(screen.getByTestId('app-version'))).toBe(true);
    expect(screen.getAllByTestId('app-version')).toHaveLength(1);
  });

  it('keeps the one live region mounted across the toggle, node and all', async () => {
    // The layout swap rebuilds the status subtree rather than relocating it —
    // React reconciles by position, and the two branches are different trees. A
    // live region that goes down and comes back up with its text already in it
    // announces nothing, which is the failure `TurnStatus` documents. So the
    // region is a sibling of `GameLayout`, not a child of the part that moves,
    // and this asserts the *node identity* survives rather than merely that a
    // region exists on both sides.
    // Scoped to the sr-only one: `VersionLine` has a polite region of its own
    // for its "À jour" flash, and that one is visible text rather than the
    // game's single announcer.
    const announcer = () => document.querySelectorAll('.sr-only[aria-live="polite"]');

    render(<App />);
    const before = announcer();
    expect(before).toHaveLength(1);

    await enterFullscreen();

    const after = announcer();
    expect(after).toHaveLength(1);
    expect(after[0]).toBe(before[0]);
  });

  it('drops the hint, which has no row left to sit in', async () => {
    render(<App />);
    expect(screen.getByText(/faites glisser un pion/i)).toBeDefined();

    await enterFullscreen();
    expect(screen.queryByText(/faites glisser un pion/i)).toBeNull();
  });

  it('puts everything back when fullscreen is left', async () => {
    render(<App />);
    await enterFullscreen();
    expect(boardFit().contains(screen.getByRole('button', { name: /^lancer$/i }))).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Quitter le plein écran' }));
    });

    expect(boardFit().contains(screen.getByRole('button', { name: /^lancer$/i }))).toBe(false);
    expect(screen.getByText(/faites glisser un pion/i)).toBeDefined();
    expect(screen.getAllByTestId('app-version')).toHaveLength(1);
  });
});
