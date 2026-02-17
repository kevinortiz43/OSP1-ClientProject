import { getCache, setCache, clearCache, clearCacheByPattern } from '../caching/cache';
import { dockerPool } from '../sql_db/db_connect_agnostic';
import { type CachedSearchResult } from '../types';

// cache keys for consistency
// couldn't use enum due to "This syntax is not allowed when 'erasableSyntaxOnly' is enabled," means you are using a TypeScript construct that generates runtime JavaScript code, which is forbidden by the erasableSyntaxOnly compiler option. The enum declaration is one such construct. 


// cache keys for consistency
// couldn't use enum due to "This syntax is not allowed when 'erasableSyntaxOnly' is enabled," means you are using a TypeScript construct that generates runtime JavaScript code, which is forbidden by the erasableSyntaxOnly compiler option. The enum declaration is one such construct.
export const CacheKeys = {
  TEAMS_ALL: "teams:all",
  CONTROLS_ALL: "controls:all",
  FAQS_ALL: "faqs:all",
  SEARCH_CACHE_PREFIX: "search:keywords"
};


const SEARCH_CACHE_TTL = 300; // 5 minutes - same as GET endpoints

export const dataService = {
  // GET with cache
  async getTeams() {
    const cached = getCache(CacheKeys.TEAMS_ALL);

    if (cached) {
      console.log("Cache teams HIT");
      return { data: cached, source: "cache" };
    }

    console.log("cache teams MISS, querying DB");

    const result = await dockerPool.query('SELECT * FROM "allTeams"');
    const data = result.rows;

    // cache for a long time (maybe 1 day?) since data rarely changes
    // for testing, set to 5 minutes

    setCache(CacheKeys.TEAMS_ALL, data, 300);

    return { data, source: "database" };
  },

  async getControls() {
    const cached = getCache(CacheKeys.CONTROLS_ALL);
    if (cached) {
      console.log("cache controls HIT");
      return { data: cached, source: "cache" };
    }

    console.log("cache controls MISS, querying DB");
    const result = await dockerPool.query('SELECT * FROM "allTrustControls"');
    const data = result.rows;

    setCache(CacheKeys.CONTROLS_ALL, data, 300);

    return { data, source: "database" };
  },

  async getFaqs() {
    const cached = getCache(CacheKeys.FAQS_ALL);
    if (cached) {
      console.log("cache FAQs HIT");
      return { data: cached, source: "cache" };
    }

    console.log("cache FAQs MISS, querying DB");
    const result = await dockerPool.query('SELECT * FROM "allTrustFaqs"');
    const data = result.rows;

    setCache(CacheKeys.FAQS_ALL, data, 300);

    return { data, source: "database" };
  },

 // clear cache (for admin UPDATE, DELETE)
  clearCache(type?: "teams" | "controls" | "faqs" | "search") {
    if (!type) {
      // Clear all cache types
      clearCache(CacheKeys.TEAMS_ALL);
      clearCache(CacheKeys.CONTROLS_ALL);
      clearCache(CacheKeys.FAQS_ALL);
      
      // Clear all search cache entries (keys with SEARCH_CACHE_PREFIX)
      clearCacheByPattern(`${CacheKeys.SEARCH_CACHE_PREFIX}*`);
      
      console.log("All cache cleared");
      return;
    }

    if (type === "search") {
      // Clear all search cache entries
      clearCacheByPattern(`${CacheKeys.SEARCH_CACHE_PREFIX}*`);
      
      console.log("Search cache cleared");
      return;
    }

    const keyMap = {
      teams: CacheKeys.TEAMS_ALL,
      controls: CacheKeys.CONTROLS_ALL,
      faqs: CacheKeys.FAQS_ALL,
    };

    clearCache(keyMap[type]);
    console.log(`Cache cleared for ${type}`);
  },

// add method to cache search
 async getCachedSearch(normalizedQuery: string): Promise<CachedSearchResult | null> {
    const cacheKey = `${CacheKeys.SEARCH_CACHE_PREFIX}${normalizedQuery}`;
    const cached = getCache<CachedSearchResult>(cacheKey); // Add type parameter
    
    if (cached) {
      console.log(`Search cache HIT: ${normalizedQuery}`);
      return cached;
    }
    
    console.log(`Search cache MISS: ${normalizedQuery}`);
    return null;
  },

  // ============= FIX THE PARAMETER TYPE =============
  async setCachedSearch(normalizedQuery: string, resultData: CachedSearchResult): Promise<void> {
    const cacheKey = `${CacheKeys.SEARCH_CACHE_PREFIX}${normalizedQuery}`;
    const cacheData: CachedSearchResult = {
      results: resultData.results,
      formatted: resultData.formatted,
      timestamp: new Date().toISOString()
    };
    
    setCache(cacheKey, cacheData, SEARCH_CACHE_TTL);
    console.log(`Search cache SET: ${normalizedQuery}`);
  }

  
};
