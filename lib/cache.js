/**
 * Simpele in-memory cache met TTL. Stale waarden blijven beschikbaar als
 * fallback; de consumer beslist wat te doen op basis van `fresh`.
 */
export function createCache({ ttlMs }) {
  const store = new Map();

  return {
    set(key, value) {
      store.set(key, { value, setAt: Date.now() });
    },
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      const age = Date.now() - entry.setAt;
      return {
        value: entry.value,
        age,
        fresh: age < ttlMs,
      };
    },
  };
}
