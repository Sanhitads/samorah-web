import { useEffect, useState } from "react";

/**
 * Hydration-safe selector for persisted Zustand stores (BRD §24.1).
 *
 * Next.js renders on the server, where `localStorage` does not exist, while a
 * `persist`-ed Zustand store only hydrates from `localStorage` on the client.
 * Reading that persisted state during SSR (empty) and again after client
 * hydration (full) produces a React hydration mismatch — and a crash.
 *
 * This hook returns `undefined` on the server and the first client render, then
 * sets the real value in a post-mount effect. Persisted state is therefore only
 * ever rendered on the client.
 *
 * @example
 *   const items = useStore(useCartStore, (s) => s.items);
 *   if (!items) return null; // first render only (or render a skeleton)
 */
export function useStore<T, F>(
  store: (selector: (state: T) => F) => F,
  selector: (state: T) => F,
): F | undefined {
  const result = store(selector);
  const [data, setData] = useState<F>();

  useEffect(() => {
    setData(result);
  }, [result]);

  return data;
}
