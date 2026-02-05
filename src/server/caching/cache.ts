

const cache = new Map<string, { data: any; timestamp: Date }>();

export function getCache(key: string) {
  return cache.get(key);
}

export function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: new Date() });
}

export function clearCache(key?: string) {
  key ? cache.delete(key) : cache.clear();
}