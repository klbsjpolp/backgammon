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

  it('keeps every finished game, which Dedupe would drop as a repeat', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@example.ingest.sentry.io/1');
    await load();
    const { integrations } = vi.mocked(Sentry.init).mock.calls[0][0] as {
      integrations: (defaults: { name: string }[]) => { name: string }[];
    };
    // The real defaults, so a renamed integration fails here instead of slipping through.
    const actual = await vi.importActual<typeof Sentry>('@sentry/react');
    const defaults = actual.getDefaultIntegrations({});
    expect(defaults.map((i) => i.name)).toContain('Dedupe');
    const kept = integrations(defaults).map((i) => i.name);
    expect(kept).not.toContain('Dedupe');
    expect(kept.length).toBe(defaults.length - 1);
  });

  it('leaves Sentry off without one', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await load();
    expect(Sentry.init).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
