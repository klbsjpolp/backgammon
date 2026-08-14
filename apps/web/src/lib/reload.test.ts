import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadApp } from '@/lib/reload';
import { activateWaitingServiceWorker } from '@/lib/serviceWorker';

vi.mock('@/lib/serviceWorker', () => ({ activateWaitingServiceWorker: vi.fn() }));

const activate = vi.mocked(activateWaitingServiceWorker);
const reload = vi.fn();

describe('reloadApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({ reload } as unknown as Location);
  });

  it('reloads directly when no service worker took over', async () => {
    activate.mockResolvedValue(false);

    reloadApp();

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  // The whole point of going through the worker: it reloads as part of taking
  // control, and a second reload here would land on the old precached build.
  it('leaves the reload to the service worker that activated', async () => {
    activate.mockResolvedValue(true);

    reloadApp();

    await vi.waitFor(() => expect(activate).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
  });

  it('falls back to a plain reload when activation throws', async () => {
    activate.mockRejectedValue(new Error('no controller'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    reloadApp();

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});
