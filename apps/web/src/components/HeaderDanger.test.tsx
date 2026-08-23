import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { fetchRuntimeConfig } from '@/lib/runtimeConfig';
import { App } from '@/App';

vi.mock('@/lib/appVersion', () => ({ APP_VERSION: 'v1.2.3' }));
vi.mock('@/lib/reload', () => ({ reloadApp: vi.fn() }));
vi.mock('@/lib/runtimeConfig', () => ({ fetchRuntimeConfig: vi.fn() }));

const fetchRuntimeConfigMock = vi.mocked(fetchRuntimeConfig);

/**
 * jsdom implements no `matchMedia` at all, which is exactly why `useRoomyScreen`
 * answers false without one — every other test in this suite therefore sees the
 * phone layout, with the abandon controls under the board. This one installs a
 * matchMedia that says the screen is roomy, which is the only way to reach the
 * other branch.
 */
const setRoomy = (roomy: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: roomy,
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

/** The header's switch cluster — mode buttons, theme swatches, and the slot. */
const headerCluster = (): HTMLElement =>
  screen.getByRole('button', { name: /^contre l'ia$/i }).closest('div.shrink-0') as HTMLElement;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  fetchRuntimeConfigMock.mockResolvedValue({ appVersion: 'v1.2.3' });
});

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
  vi.clearAllMocks();
});

describe('the abandon-the-game controls', () => {
  it('ride in the header row on a roomy screen, beside the mode and theme switches', () => {
    setRoomy(true);
    render(<App />);

    expect(within(headerCluster()).getByRole('button', { name: /nouvelle partie/i })).toBeDefined();
  });

  it('stay under the board on a phone', () => {
    setRoomy(false);
    render(<App />);

    expect(within(headerCluster()).queryByRole('button', { name: /nouvelle partie/i })).toBeNull();
    expect(screen.getByRole('button', { name: /nouvelle partie/i })).toBeDefined();
  });

  it('are in the tree exactly once either way — the button moves, it is not copied', () => {
    setRoomy(true);
    const { unmount } = render(<App />);
    expect(screen.getAllByRole('button', { name: /nouvelle partie/i })).toHaveLength(1);
    unmount();

    setRoomy(false);
    render(<App />);
    expect(screen.getAllByRole('button', { name: /nouvelle partie/i })).toHaveLength(1);
  });
});
