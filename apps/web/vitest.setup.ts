/**
 * Repairs `localStorage` / `sessionStorage` on Node ≥ 25.
 *
 * Vitest's jsdom environment copies the jsdom window's keys onto `globalThis`,
 * but deliberately skips any key Node already defines there — clobbering Node's
 * own globals would be worse. Node 25 added Web Storage to that set, and without
 * `--localstorage-file` its `localStorage` is an inert empty object. So the key
 * is now "already defined", jsdom's real `Storage` is never installed, and every
 * test that touches storage fails on `localStorage.clear is not a function`.
 *
 * CI runs Node 22 and 24, where the globals are jsdom's own and this does
 * nothing — which is the point of the guard. It repairs a broken global rather
 * than replacing a working one, so the shim stops being reached the moment
 * Vitest handles the collision, and deleting this file is the only cleanup.
 *
 * jsdom's own `Storage` is not reachable from here (that is precisely what went
 * missing), and importing `jsdom` to build a second document costs a type
 * dependency and a fresh DOM per test file for a handful of string keys. Hence
 * the map below: small enough to read, and it keeps the two semantics the tests
 * actually lean on — every value is a string, a missing key is `null`.
 */

const createStorage = (): Storage => {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(String(key)) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      entries.delete(String(key));
    },
    clear: () => {
      entries.clear();
    },
  };
};

const isUsable = (storage: unknown): boolean =>
  typeof (storage as Storage | undefined)?.clear === 'function' &&
  typeof (storage as Storage | undefined)?.getItem === 'function';

for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (isUsable(globalThis[key])) continue;

  Object.defineProperty(globalThis, key, {
    value: createStorage(),
    configurable: true,
    writable: true,
  });
}
