import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRuntimeConfig } from './runtimeConfig';

const stubFetch = (impl: () => Promise<unknown>) => {
  vi.stubGlobal('fetch', vi.fn(impl));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRuntimeConfig', () => {
  it('reads the deployed versions past the HTTP cache', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ appVersion: 'v1.2.3', minimumSupportedVersion: 'v1.0.0' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRuntimeConfig()).resolves.toEqual({ appVersion: 'v1.2.3', minimumSupportedVersion: 'v1.0.0' });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('runtime-config.json'), { cache: 'no-store' });
  });

  it('returns null when the file is missing', async () => {
    stubFetch(async () => ({ ok: false, json: async () => ({}) }));
    await expect(fetchRuntimeConfig()).resolves.toBeNull();
  });

  it('returns null when the request fails', async () => {
    stubFetch(async () => {
      throw new Error('offline');
    });
    await expect(fetchRuntimeConfig()).resolves.toBeNull();
  });

  it('returns null when the body is not JSON', async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('unexpected token');
      },
    }));
    await expect(fetchRuntimeConfig()).resolves.toBeNull();
  });
});
