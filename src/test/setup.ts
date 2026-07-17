// Minimal Web Storage polyfills so persist-ed Zustand stores run under vitest/node.
// Both are needed: cart/wishlist/composition persist to localStorage, checkout to sessionStorage.
// Without the matching polyfill, zustand's createJSONStorage catches the missing global and returns
// undefined — persistence would quietly no-op rather than fail, and a test would prove nothing.
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const g = globalThis as unknown as { localStorage: Storage; sessionStorage: Storage };
g.localStorage = memoryStorage();
g.sessionStorage = memoryStorage();
