import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';

vi.mock('@sentry/react', () => ({ init: vi.fn() }));

const load = async () => {
  vi.resetModules();
  await import('@/instrument');
};

describe('instrument', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(Sentry.init).mockClear();
  });

  it('starts Sentry when a DSN is given', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', ' https://key@example.ingest.sentry.io/1 ');
    await load();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://key@example.ingest.sentry.io/1', tracesSampleRate: 1 }),
    );
  });

  it('leaves Sentry off without one', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await load();
    expect(Sentry.init).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
