import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerSW = vi.hoisted(() => vi.fn());
vi.mock('virtual:pwa-register', () => ({ registerSW }));

const { activateWaitingServiceWorker, registerServiceWorker, resetServiceWorkerForTests } =
  await import('@/lib/serviceWorker');

type MutableRegistration = {
  installing: ServiceWorker | null;
  waiting: ServiceWorker | null;
  update: ReturnType<typeof vi.fn>;
};

const createRegistration = (overrides: Partial<MutableRegistration> = {}): MutableRegistration => ({
  installing: null,
  waiting: null,
  update: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

/** Registers the worker and hands back the plugin's update function. */
const register = (registration: MutableRegistration | null) => {
  const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
  registerSW.mockImplementation((options: Parameters<typeof registerSW>[0]) => {
    options?.onRegisteredSW?.('/sw.js', registration as unknown as ServiceWorkerRegistration | undefined);
    return updateServiceWorker;
  });
  registerServiceWorker();
  return updateServiceWorker;
};

describe('serviceWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetServiceWorkerForTests();
  });

  it('registers only once', () => {
    register(createRegistration());
    registerServiceWorker();

    expect(registerSW).toHaveBeenCalledTimes(1);
  });

  it('reports no activation when nothing was ever registered', async () => {
    await expect(activateWaitingServiceWorker()).resolves.toBe(false);
  });

  // An insecure origin, or storage blocked. The app has to keep working without
  // a worker — it is simply not installable or offline.
  it('carries on without a worker when registration fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerSW.mockImplementation((options: Parameters<typeof registerSW>[0]) => {
      options?.onRegisterError?.(new Error('insecure origin'));
      return vi.fn();
    });
    registerServiceWorker();

    expect(warn).toHaveBeenCalled();
    await expect(activateWaitingServiceWorker()).resolves.toBe(false);
  });

  it('activates and reloads onto a waiting worker', async () => {
    const registration = createRegistration({ waiting: {} as ServiceWorker });
    const updateServiceWorker = register(registration);

    await expect(activateWaitingServiceWorker()).resolves.toBe(true);
    expect(registration.update).toHaveBeenCalled();
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('reports no activation when the deploy has nothing newer staged', async () => {
    const registration = createRegistration();
    const updateServiceWorker = register(registration);

    await expect(activateWaitingServiceWorker()).resolves.toBe(false);
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  // The window a bare `registration.waiting` check would miss: update() resolves
  // while the new worker is still installing, and it only becomes `waiting` a
  // moment later.
  it('waits for an installing worker before deciding nothing is staged', async () => {
    const listeners = new Set<() => void>();
    const installing = {
      state: 'installing',
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
    const registration = createRegistration({ installing: installing as unknown as ServiceWorker });
    const updateServiceWorker = register(registration);

    const activation = activateWaitingServiceWorker();
    await vi.waitFor(() => expect(listeners.size).toBe(1));

    // A `statechange` that leaves the worker installing is not the one we want;
    // resolving on it would put us back in the false-negative this guards.
    listeners.forEach((listener) => listener());
    expect(listeners.size).toBe(1);

    installing.state = 'installed';
    registration.waiting = {} as ServiceWorker;
    listeners.forEach((listener) => listener());

    await expect(activation).resolves.toBe(true);
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  // The plugin reports a registration of `undefined` when the browser hands it
  // nothing back, which is not the same as an error and must not be stored.
  it('treats a missing registration as nothing to activate', async () => {
    register(null);

    await expect(activateWaitingServiceWorker()).resolves.toBe(false);
  });

  // `installing` is a snapshot: the worker can have moved on by the time we look
  // at it, and waiting on a `statechange` that already fired would hang.
  it('does not wait on a worker that has already left installing', async () => {
    const installed = {
      state: 'installed',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const registration = createRegistration({
      installing: installed as unknown as ServiceWorker,
      waiting: {} as ServiceWorker,
    });
    const updateServiceWorker = register(registration);

    await expect(activateWaitingServiceWorker()).resolves.toBe(true);
    expect(installed.addEventListener).not.toHaveBeenCalled();
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  // A download that stalls must not leave the caller awaiting forever: the
  // player pressed a button, and "nothing staged" is an answer they can act on.
  it('gives up on an install that never settles', async () => {
    vi.useFakeTimers();
    const stalled = {
      state: 'installing',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const registration = createRegistration({ installing: stalled as unknown as ServiceWorker });
    const updateServiceWorker = register(registration);

    const activation = activateWaitingServiceWorker();
    await vi.waitFor(() => expect(stalled.addEventListener).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(8000);

    await expect(activation).resolves.toBe(false);
    expect(stalled.removeEventListener).toHaveBeenCalled();
    expect(updateServiceWorker).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('still activates what is waiting when the update check fails offline', async () => {
    const registration = createRegistration({
      waiting: {} as ServiceWorker,
      update: vi.fn().mockRejectedValue(new Error('offline')),
    });
    const updateServiceWorker = register(registration);

    await expect(activateWaitingServiceWorker()).resolves.toBe(true);
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
