import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { fetchRuntimeConfig } from '@/lib/runtimeConfig';
import { App } from '@/App';

vi.mock('@/lib/appVersion', () => ({ APP_VERSION: 'v1.2.3' }));
vi.mock('@/lib/reload', () => ({ reloadApp: vi.fn() }));
vi.mock('@/lib/runtimeConfig', () => ({ fetchRuntimeConfig: vi.fn() }));

const fetchRuntimeConfigMock = vi.mocked(fetchRuntimeConfig);

/**
 * Placement no longer depends on screen width — see `HeaderMenu` — but both
 * states are exercised here to prove that independence rather than assume it:
 * before this component existed, `isRoomy` was exactly what decided it.
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

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Actions' }));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  fetchRuntimeConfigMock.mockResolvedValue({ appVersion: 'v1.2.3' });
});

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
  vi.clearAllMocks();
});

describe('the abandon-the-game action', () => {
  it.each([true, false])('lives behind the header menu whether the screen is roomy (%s) or not', (roomy) => {
    setRoomy(roomy);
    render(<App />);

    openMenu();
    expect(screen.getByRole('button', { name: /nouvelle partie/i })).toBeDefined();
  });

  it('is in the tree exactly once, behind the one menu', () => {
    render(<App />);

    openMenu();
    expect(screen.getAllByRole('button', { name: /nouvelle partie/i })).toHaveLength(1);
  });

  it('has no menu to offer on the online "host or join" screen — there is nothing to abandon yet', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^en ligne$/i }));
    expect(screen.queryByRole('button', { name: 'Actions' })).toBeNull();
  });

  it('closes the menu once the confirmed action fires', () => {
    render(<App />);

    openMenu();
    const newGame = screen.getByRole('button', { name: /nouvelle partie/i });
    fireEvent.click(newGame); // arms it
    fireEvent.click(newGame); // confirms it

    expect(screen.getByRole('button', { name: 'Actions' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape', () => {
    render(<App />);

    openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Actions' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on an outside click', () => {
    render(<App />);

    openMenu();
    fireEvent.mouseDown(screen.getByRole('heading', { name: /backgammon/i }));

    expect(screen.getByRole('button', { name: 'Actions' }).getAttribute('aria-expanded')).toBe('false');
  });
});
