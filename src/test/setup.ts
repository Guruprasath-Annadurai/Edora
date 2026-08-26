import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia — several components probe it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom doesn't implement IndexedDB — offlineCache falls back gracefully,
// but stub it so tests don't throw on import
if (!('indexedDB' in window)) {
  // @ts-expect-error -- test stub
  window.indexedDB = undefined;
}

// jsdom's own localStorage implementation requires a real http(s) origin;
// this project's vitest config doesn't set test.environmentOptions.jsdom.url,
// so it defaults to an origin where the spec has jsdom leave
// window.localStorage undefined. Any test touching localStorage (e.g.
// mockExamRecovery.ts's interruption-recovery persistence) would otherwise
// throw "Cannot read properties of undefined" on the very first call.
if (!window.localStorage) {
  const store = new Map<string, string>();
  const memoryLocalStorage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(window, 'localStorage', { writable: true, value: memoryLocalStorage });
  Object.defineProperty(globalThis, 'localStorage', { writable: true, value: memoryLocalStorage });
}
