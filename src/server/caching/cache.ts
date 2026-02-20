// Bun-native cache using Map (no external dependency needed)

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const DEFAULT_TTL = 300; // 5 minutes in seconds
const CHECK_PERIOD = 120; // cleanup interval in seconds

const store = new Map<string, CacheEntry<unknown>>();

let hits = 0;
let misses = 0;

// Auto-cleanup expired keys (replaces node-cache's checkperiod)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt && now > entry.expiresAt) {
      store.delete(key);
    }
  }
}, CHECK_PERIOD * 1000);

// Get cached data
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

// Set cache with optional TTL
export function setCache<T>(key: string, data: T, ttl?: number): boolean {
  const ttlSeconds = ttl ?? DEFAULT_TTL;
  store.set(key, {
    data,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
  });
  return true;
}

// Check cache stats
export function getCacheStats() {
  return {
    keys: store.size,
    hits,
    misses,
    ksize: store.size,
    vsize: [...store.values()].reduce(
      (acc, entry) => acc + JSON.stringify(entry.data).length,
      0
    ),
  };
}

// Delete specific key or flush all
export function clearCache(key?: string) {
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
  getCacheStats();
}

// Check if key exists and is not expired
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