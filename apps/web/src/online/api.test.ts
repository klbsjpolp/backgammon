import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnlineRoom, joinOnlineRoom } from './api';
import { getApiBaseUrl } from './config';

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  json: () => Promise.resolve(body),
});

describe('getApiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws a actionable error when the server is not configured', () => {
    vi.stubEnv('VITE_BACKGAMMON_API_URL', '');
    expect(() => getApiBaseUrl()).toThrow(/VITE_BACKGAMMON_API_URL/);
  });

  it('strips a trailing slash so paths concatenate cleanly', () => {
    vi.stubEnv('VITE_BACKGAMMON_API_URL', 'https://relay.test/ ');
    expect(getApiBaseUrl()).toBe('https://relay.test');
  });
});

describe('room api', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('VITE_BACKGAMMON_API_URL', 'https://relay.test');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('creates a room tagged as a backgammon room, carrying the config', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ roomCode: 'ABCD' }));

    await expect(createOnlineRoom({ useDoublingCube: true })).resolves.toMatchObject({ roomCode: 'ABCD' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.test/rooms');
    expect(JSON.parse(init.body as string)).toEqual({
      gameId: 'backgammon',
      gameConfig: { useDoublingCube: true },
    });
  });

  it('joins a room by code', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ roomCode: 'WXYZ', seatIndex: 1 }));

    await expect(joinOnlineRoom('WXYZ')).resolves.toMatchObject({ seatIndex: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://relay.test/rooms/join');
  });

  it('surfaces the server message on a failed request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Room is full.' }, false));
    await expect(joinOnlineRoom('FULL')).rejects.toThrow('Room is full.');
  });

  it('falls back to a generic message when the error body is unusable', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('not json')) });
    await expect(joinOnlineRoom('BAD')).rejects.toThrow('La requête a échoué.');
  });
});
