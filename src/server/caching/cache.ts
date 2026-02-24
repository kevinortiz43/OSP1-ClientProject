interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const DEFAULT_TTL = 300;
const CHECK_PERIOD = 120;

const store = new Map<string, CacheEntry<unknown>>();

let hits = 0;
let misses = 0;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt && now > entry.expiresAt) {
      store.delete(key);
    }
  }
}, CHECK_PERIOD * 1000);

export function getCache<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;

  if (!entry) {
    misses++;
    return undefined;
  }

  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    store.delete(key);
    misses++;
    return undefined;
  }

  hits++;
  return entry.data;
}

export function setCache<T>(key: string, data: T, ttl?: number): boolean {
  const ttlSeconds = ttl ?? DEFAULT_TTL;
  store.set(key, {
    data,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
  });
  return true;
}

export function getCacheStats() {
  return {
    keys: store.size,
    hits,
    misses,
    ksize: store.size,
    vsize: [...store.values()].reduce(
      (acc, entry) => acc + JSON.stringify(entry.data).length,
      0,
    ),
  };
}

export function clearCache(key?: string) {
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
  getCacheStats();
}

export function hasCache(key: string): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    store.delete(key);
    return false;
  }
  return true;
}

export default store;
