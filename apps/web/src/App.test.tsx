import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { reloadApp } from '@/lib/reload';
import { fetchRuntimeConfig } from '@/lib/runtimeConfig';
import { App } from './App';

vi.mock('@/lib/appVersion', () => ({ APP_VERSION: 'v1.2.3' }));
vi.mock('@/lib/reload', () => ({ reloadApp: vi.fn() }));
vi.mock('@/lib/runtimeConfig', () => ({ fetchRuntimeConfig: vi.fn() }));

const fetchRuntimeConfigMock = vi.mocked(fetchRuntimeConfig);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  fetchRuntimeConfigMock.mockResolvedValue({ appVersion: 'v1.2.3' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('App', () => {
  it('renders the board and opening status', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /backgammon/i })).toBeDefined();
    expect(screen.getByText(/white to roll/i, { ignore: '.sr-only' })).toBeDefined();
    // 24 points are rendered.
    expect(screen.getAllByLabelText(/^point \d+,/)).toHaveLength(24);
  });

  it('rolls into the moving phase', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^roll$/i }));
    expect(await screen.findByText(/to move/i, { ignore: '.sr-only' })).toBeDefined();
  });

  it('shows the running version', () => {
    render(<App />);
    expect(screen.getByTestId('app-version').textContent).toBe('Version v1.2.3');
  });

  it('offers the update instead of reloading a local game away', async () => {
    fetchRuntimeConfigMock.mockResolvedValue({ appVersion: 'v1.3.0' });
    render(<App />);

    expect(await screen.findByTestId('update-banner')).toBeDefined();
    expect(reloadApp).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: /update now/i })[0]);
    expect(reloadApp).toHaveBeenCalledTimes(1);
  });

  it('takes the pending update when a new game is started', async () => {
    fetchRuntimeConfigMock.mockResolvedValue({ appVersion: 'v1.3.0' });
    render(<App />);
    await screen.findByTestId('update-banner');

    // Two taps: the destructive button arms before it fires.
    const newGame = screen.getByRole('button', { name: /new game/i });
    fireEvent.click(newGame);
    fireEvent.click(newGame);
    expect(reloadApp).toHaveBeenCalledTimes(1);
  });

  it('blocks play below the supported version floor', async () => {
    fetchRuntimeConfigMock.mockResolvedValue({ appVersion: 'v2.0.0', minimumSupportedVersion: 'v2.0.0' });
    render(<App />);

    const overlay = await screen.findByTestId('update-required-overlay');
    expect(overlay.textContent).toContain('Update required');
    // A required update never offers the dismissible banner.
    expect(screen.queryByTestId('update-banner')).toBeNull();
    expect(reloadApp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /reload now/i }));
    expect(reloadApp).toHaveBeenCalledTimes(1);
  });

  it('confirms an up-to-date check from the footer', async () => {
    render(<App />);

    // The check fired on mount has to settle before the button is idle again.
    fireEvent.click(await screen.findByRole('button', { name: /check for updates/i }));
    await waitFor(() => expect(screen.getByText('Up to date')).toBeDefined());
  });

  it('reports the version it just updated from', async () => {
    localStorage.setItem('backgammon:last-seen-version', 'v1.0.0');
    render(<App />);

    expect(screen.getByTestId('updated-notice').textContent).toContain('Updated to v1.2.3');
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByTestId('updated-notice')).toBeNull();
  });
});
