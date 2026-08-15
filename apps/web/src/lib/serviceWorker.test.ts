import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registerSW = vi.hoisted(() => vi.fn());
vi.mock('virtual:pwa-register', () => ({ registerSW }));

const { activateWaitingServiceWorker, registerServiceWorker, resetServiceWorkerForTests } =
  await import('@/lib/serviceWorker');

type MutableRegistration = {
  installing: ServiceWorker | null;
  waiting: (ServiceWorker & { postMessage: ReturnType<typeof vi.fn> }) | null;
  update: ReturnType<typeof vi.fn>;
};

const createWaitingWorker = () =>
  ({ postMessage: vi.fn() }) as unknown as ServiceWorker & {
    postMessage: ReturnType<typeof vi.fn>;
  };

const createRegistration = (overrides: Partial<MutableRegistration> = {}): MutableRegistration => ({
  installing: null,
  waiting: null,
  update: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const reload = vi.fn();
/** Listeners the module attached to the container, by event name. */
const containerListeners = new Map<string, Set<() => void>>();
let getRegistrationResult: Promise<MutableRegistration | null> = Promise.resolve(null);

const container = {
  getRegistration: () => getRegistrationResult,
  addEventListener: (type: string, listener: () => void) => {
    const existing = containerListeners.get(type) ?? new Set<() => void>();
    existing.add(listener);
    containerListeners.set(type, existing);
  },
  removeEventListener: (type: string, listener: () => void) => {
    containerListeners.get(type)?.delete(listener);
  },
};

/** Fires `controllerchange`, as a worker taking control does. */
const takeControl = () => {
  for (const listener of [...(containerListeners.get('controllerchange') ?? [])]) listener();
};

/** Registers the worker, reporting `registration` from `onRegisteredSW`. */
const register = (registration: MutableRegistration | null) => {
  registerSW.mockImplementation((options: Parameters<typeof registerSW>[0]) => {
    options?.onRegisteredSW?.('/sw.js', registration as unknown as ServiceWorkerRegistration | undefined);
    return vi.fn();
  });
  registerServiceWorker();
};

describe('serviceWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetServiceWorkerForTests();
    containerListeners.clear();
    getRegistrationResult = Promise.resolve(null);
    vi.stubGlobal('navigator', { serviceWorker: container });
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({ reload } as unknown as Location);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('registers only once', () => {
    register(createRegistration());
    registerServiceWorker();

    expect(registerSW).toHaveBeenCalledTimes(1);
  });

  it('reports no activation in a browser without service workers', async () => {
    vi.stubGlobal('navigator', {});

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

  it('activates a waiting worker and reloads once it has control', async () => {
    const waiting = createWaitingWorker();
    const registration = createRegistration({ waiting });
    register(registration);

    const activation = activateWaitingServiceWorker();
    await vi.waitFor(() => expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
    // Not yet: the reload waits for the new worker to actually take over.
    expect(reload).not.toHaveBeenCalled();

    takeControl();

    await expect(activation).resolves.toBe(true);
    expect(registration.update).toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // The listener has to be attached before the message: a worker can take
  // control immediately, and a listener added afterwards waits for an event that
  // has already fired.
  it('listens for the handover before asking for it', async () => {
    const waiting = createWaitingWorker();
    waiting.postMessage.mockImplementation(() => {
      expect(containerListeners.get('controllerchange')?.size).toBe(1);
      takeControl();
    });
    register(createRegistration({ waiting }));

    await expect(activateWaitingServiceWorker()).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // A worker that never takes control must not strand a player who pressed the
  // button; reloading anyway is the safer of the two answers.
  it('reloads anyway when the handover never completes', async () => {
    vi.useFakeTimers();
    const waiting = createWaitingWorker();
    register(createRegistration({ waiting }));

    const activation = activateWaitingServiceWorker();
    await vi.waitFor(() => expect(waiting.postMessage).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(3000);

    await expect(activation).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(containerListeners.get('controllerchange')?.size).toBe(0);
  });

  it('reports no activation when the deploy has nothing newer staged', async () => {
    register(createRegistration());

    await expect(activateWaitingServiceWorker()).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  // The version poll can fire before the plugin's `onRegisteredSW` does — it
  // defers `wb.register()` to `window.load`. Reading the browser's own
  // registration keeps "no worker" from meaning "our callback is late", which
  // would reload straight back into the precached build.
  it('finds a registration the plugin has not reported yet', async () => {
    const waiting = createWaitingWorker();
    getRegistrationResult = Promise.resolve(createRegistration({ waiting }));

    const activation = activateWaitingServiceWorker();
    await vi.waitFor(() => expect(waiting.postMessage).toHaveBeenCalled());
    takeControl();

    await expect(activation).resolves.toBe(true);
  });

  // Looking one up throws where the API exists but is refused — a sandboxed
  // frame, storage blocked. That is "no worker", not a crash on the way out.
  it('treats a refused registration lookup as nothing to activate', async () => {
    getRegistrationResult = Promise.reject(new Error('storage blocked'));

    await expect(activateWaitingServiceWorker()).resolves.toBe(false);
  });

  it('treats a missing registration as nothing to activate', async () => {
    register(null);

    await expect(activateWaitingServiceWorker()).resolves.toBe(false);
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
    register(registration);

    const activation = activateWaitingServiceWorker();
    await vi.waitFor(() => expect(listeners.size).toBe(1));

    // A `statechange` that leaves the worker installing is not the one we want;
    // resolving on it would put us back in the false-negative this guards.
    listeners.forEach((listener) => listener());
    expect(listeners.size).toBe(1);

    installing.state = 'installed';
    registration.waiting = createWaitingWorker();
    listeners.forEach((listener) => listener());

    await vi.waitFor(() => expect(registration.waiting?.postMessage).toHaveBeenCalled());
    takeControl();

    await expect(activation).resolves.toBe(true);
  });

  // `installing` is a snapshot: the worker can have moved on by the time we look
  // at it, and waiting on a `statechange` that already fired would hang.
  it('does not wait on a worker that has already left installing', async () => {
    const installed = { state: 'installed', addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const waiting = createWaitingWorker();
    register(createRegistration({ installing: installed as unknown as ServiceWorker, waiting }));

    const activation = activateWaitingServiceWorker();
    await vi.waitFor(() => expect(waiting.postMessage).toHaveBeenCalled());
    takeControl();

    await expect(activation).resolves.toBe(true);
    expect(installed.addEventListener).not.toHaveBeenCalled();
  });

  // A download that stalls must not leave the caller awaiting forever: the
  // player pressed a button, and "nothing staged" is an answer they can act on.
  it('gives up on an install that never settles', async () => {
    vi.useFakeTimers();
    const stalled = { state: 'installing', addEventListener: vi.fn(), removeEventListener: vi.fn() };
    register(createRegistration({ installing: stalled as unknown as ServiceWorker }));

    const activation = activateWaitingServiceWorker();
    await vi.waitFor(() => expect(stalled.addEventListener).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(8000);

    await expect(activation).resolves.toBe(false);
    expect(stalled.removeEventListener).toHaveBeenCalled();
  });

  it('still activates what is waiting when the update check fails offline', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const waiting = createWaitingWorker();
    register(createRegistration({ waiting, update: vi.fn().mockRejectedValue(new Error('offline')) }));

    const activation = activateWaitingServiceWorker();
    await vi.waitFor(() => expect(waiting.postMessage).toHaveBeenCalled());
    takeControl();

    await expect(activation).resolves.toBe(true);
  });

  // A check that never answers is not a check that failed: without a deadline
  // the caller waits forever and the Update button does nothing at all.
  it('stops waiting on an update check that hangs', async () => {
    vi.useFakeTimers();
    const waiting = createWaitingWorker();
    register(createRegistration({ waiting, update: vi.fn().mockReturnValue(new Promise(() => {})) }));

    const activation = activateWaitingServiceWorker();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(waiting.postMessage).toHaveBeenCalled());
    takeControl();

    await expect(activation).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
