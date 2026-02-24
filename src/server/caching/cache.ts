import NodeCache from 'node-cache';

// https://www.npmjs.com/package/node-cache

// stdTTL: default time-to-live in seconds (null = no expiration)
// checkperiod: how often to check for expired keys


const cache = new NodeCache({ 
  stdTTL: 300, // 300 seconds = 5 minutes, default TTL // change to 86400 for 24 hours if database data doesn't change very frequently
  checkperiod: 120, // check for expired keys every 2 minutes // could change to every 10 minutes
  useClones: false // better performance, but be careful with mutation since this isn't deep clone of object, just stores reference to obj // if need deep clone, then change to true
});

// get cached data
export function getCache<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

// set cache with optional TTL (use ttl if provided, otherwise use default stdTTL)
export function setCache<T>(key: string, data: T, ttl?: number): boolean {
  return cache.set(key, data, Number(ttl));
}


// check cache stats (for monitoring)
// {"hits":0,"misses":0,"keys":0,"ksize":0,"vsize":0}
export function getCacheStats() {
  const stats = cache.getStats();

    return {
    keys: cache.keys().length,  // global key count
    hits: stats.hits || 0, // global hit count
    misses: stats.misses || 0, // global miss count
    ksize: stats.keys || 0, // global key size count in approximately bytes
    vsize: stats.vsize || 0,  // global value size count in approximately byte
  };
}

// delete specific cache or clear all - use for CREATE, UPDATE, DELETE operations (not yet written)
export function clearCache(key?: string | string[]) {
  if (key) {
    cache.del(key);
    if (Array.isArray(key)) {
      console.log(`Deleted ${key.length} specific keys`);
    } else {
      console.log(`Deleted key: ${key}`);
    }
    getCacheStats();
  } else {
    cache.flushAll();
    console.log('All cache flushed');
    getCacheStats();
  }
}

/**
 * Delete all cache keys that match a pattern/prefix.
 * 
 * - get all keys, filter those matching the pattern, then delete each one
 * - This is less efficient than direct pattern deletion, but works with NodeCache's API
 * - For search cache: pattern = "search:keywords*" deletes ALL cached search queries
 */

export function clearCacheByPattern(pattern: string): void {
  // Step 1: Get ALL keys from cache
  const allKeys = cache.keys();
  
  // Step 2: Convert pattern with wildcard to regex
  // Example: "search:keywords*" becomes /^search:keywords.*$/
  const regexPattern = '^' + pattern.replace('*', '.*') + '$';
  const regex = new RegExp(regexPattern);
  
  // Step 3: Filter keys that match the pattern
  const keysToDelete = allKeys.filter(key => regex.test(key));
  
  // Step 4: Delete all matching keys in one operation
  if (keysToDelete.length > 0) {
    cache.del(keysToDelete);
    console.log(`Deleted ${keysToDelete.length} keys matching pattern: ${pattern}`);
  } else {
    console.log(`No keys found matching pattern: ${pattern}`);
  }
}

// check if cache has key 
export function hasCache(key: string): boolean {
  return cache.has(key);
}

export default cache;