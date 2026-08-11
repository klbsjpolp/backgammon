import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadApp } from '@/lib/reload';
import type { RuntimeConfig } from '@/lib/runtimeConfig';
import { fetchRuntimeConfig } from '@/lib/runtimeConfig';
import { APPLIED_UPDATE_STORAGE_KEY, LAST_SEEN_VERSION_STORAGE_KEY, useAppUpdates } from './useAppUpdates';

vi.mock('@/lib/appVersion', () => ({ APP_VERSION: 'v1.2.3' }));
vi.mock('@/lib/reload', () => ({ reloadApp: vi.fn() }));
vi.mock('@/lib/runtimeConfig', () => ({ fetchRuntimeConfig: vi.fn() }));

const fetchRuntimeConfigMock = vi.mocked(fetchRuntimeConfig);
const reloadAppMock = vi.mocked(reloadApp);

const deploy = (config: RuntimeConfig | null) => {
  fetchRuntimeConfigMock.mockResolvedValue(config);
};

/** Renders the hook and waits for the check it fires on mount to land. */
const renderGate = async (options: { deferUpdate?: boolean } = {}) => {
  const view = renderHook(({ deferUpdate }) => useAppUpdates({ deferUpdate }), { initialProps: options });
  await waitFor(() => expect(view.result.current.isChecking).toBe(false));
  return view;
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  deploy({ appVersion: 'v1.2.3', minimumSupportedVersion: '' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('useAppUpdates', () => {
  it('stays put when the deployed version is the one running', async () => {
    const { result } = await renderGate();

    expect(result.current.currentVersion).toBe('v1.2.3');
    expect(result.current.latestVersion).toBe('v1.2.3');
    expect(result.current.isUpdateAvailable).toBe(false);
    expect(result.current.shouldShowUpdateBanner).toBe(false);
    expect(reloadAppMock).not.toHaveBeenCalled();
  });

  it('reloads on its own when a newer version is deployed and nothing is at stake', async () => {
    deploy({ appVersion: 'v1.3.0' });
    const { result } = await renderGate();

    expect(result.current.isUpdateAvailable).toBe(true);
    await waitFor(() => expect(reloadAppMock).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(APPLIED_UPDATE_STORAGE_KEY)).toBe('v1.3.0');
  });

  it('holds the reload back while a game is in progress, and shows the banner instead', async () => {
    deploy({ appVersion: 'v1.3.0' });
    const { result } = await renderGate({ deferUpdate: true });

    expect(result.current.isUpdateAvailable).toBe(true);
    expect(result.current.shouldShowUpdateBanner).toBe(true);
    expect(reloadAppMock).not.toHaveBeenCalled();
  });

  it('applies the deferred update once the game is over', async () => {
    deploy({ appVersion: 'v1.3.0' });
    const { rerender } = await renderGate({ deferUpdate: true });
    expect(reloadAppMock).not.toHaveBeenCalled();

    rerender({ deferUpdate: false });
    await waitFor(() => expect(reloadAppMock).toHaveBeenCalledTimes(1));
  });

  it('reloads at most once for a version, so a stale deploy cannot loop', async () => {
    sessionStorage.setItem(APPLIED_UPDATE_STORAGE_KEY, 'v1.3.0');
    deploy({ appVersion: 'v1.3.0' });
    const { result } = await renderGate();

    expect(result.current.isUpdateAvailable).toBe(true);
    expect(reloadAppMock).not.toHaveBeenCalled();
    // The manual button is the way out of that state.
    act(() => result.current.applyUpdate());
    expect(reloadAppMock).toHaveBeenCalledTimes(1);
  });

  it('applies the update on demand even mid-game', async () => {
    deploy({ appVersion: 'v1.3.0' });
    const { result } = await renderGate({ deferUpdate: true });

    act(() => result.current.applyUpdate());
    expect(reloadAppMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(APPLIED_UPDATE_STORAGE_KEY)).toBe('v1.3.0');
  });

  it('dismisses the banner for the pending version only', async () => {
    deploy({ appVersion: 'v1.3.0' });
    const { result } = await renderGate({ deferUpdate: true });

    act(() => result.current.dismissUpdate());
    expect(result.current.shouldShowUpdateBanner).toBe(false);

    deploy({ appVersion: 'v1.4.0' });
    await act(() => result.current.checkNow());
    expect(result.current.shouldShowUpdateBanner).toBe(true);
  });

  it('requires an update below the supported floor, and never offers to dismiss it', async () => {
    deploy({ appVersion: 'v2.0.0', minimumSupportedVersion: 'v2.0.0' });
    const { result } = await renderGate({ deferUpdate: true });

    expect(result.current.isUpdateRequired).toBe(true);
    expect(result.current.shouldShowUpdateBanner).toBe(false);
    expect(reloadAppMock).not.toHaveBeenCalled();
  });

  it('reloads a required update when no game is running', async () => {
    deploy({ appVersion: 'v2.0.0', minimumSupportedVersion: 'v2.0.0' });
    await renderGate();

    await waitFor(() => expect(reloadAppMock).toHaveBeenCalledTimes(1));
  });

  it('keeps the last known answer when a check fails', async () => {
    deploy({ appVersion: 'v1.3.0' });
    const { result } = await renderGate({ deferUpdate: true });
    expect(result.current.latestVersion).toBe('v1.3.0');

    deploy(null);
    await act(() => result.current.checkNow());
    expect(result.current.latestVersion).toBe('v1.3.0');
  });

  it('reports the version it came up from after an update', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_STORAGE_KEY, 'v1.0.0');
    const { result } = await renderGate();

    expect(result.current.justUpdatedFrom).toBe('v1.0.0');
    expect(localStorage.getItem(LAST_SEEN_VERSION_STORAGE_KEY)).toBe('v1.2.3');

    act(() => result.current.dismissJustUpdated());
    expect(result.current.justUpdatedFrom).toBeNull();
  });

  it('says nothing about an update when the last visit ran this same version', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_STORAGE_KEY, 'v1.2.3');
    const { result } = await renderGate();

    expect(result.current.justUpdatedFrom).toBeNull();
  });

  it('rechecks when the tab comes back to the foreground', async () => {
    const { result } = await renderGate();
    const checksOnMount = fetchRuntimeConfigMock.mock.calls.length;

    deploy({ appVersion: 'v1.3.0' });
    // The mount check just ran, so this one is inside the throttle window.
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(fetchRuntimeConfigMock).toHaveBeenCalledTimes(checksOnMount);

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(result.current.latestVersion).toBe('v1.3.0'));
  });
});
