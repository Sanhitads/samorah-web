// Minimal localStorage polyfill so persist-ed Zustand stores run under vitest/node.
const store = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
(globalThis as { localStorage: Storage }).localStorage = localStorageMock;
