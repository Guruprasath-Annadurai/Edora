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
