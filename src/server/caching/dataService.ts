// services/dataService.ts
import { getCache, setCache, clearCache } from './cache';
import { dockerPool } from '../sql_db/db_connect_agnostic';

// cache keys for consistency
// couldn't use enum due to "This syntax is not allowed when 'erasableSyntaxOnly' is enabled," means you are using a TypeScript construct that generates runtime JavaScript code, which is forbidden by the erasableSyntaxOnly compiler option. The enum declaration is one such construct. 
export const CacheKeys = {
  TEAMS_ALL: 'teams:all',
  CONTROLS_ALL: 'controls:all', 
  FAQS_ALL: 'faqs:all'
};


export const dataService = {
  // GET with cache
  async getTeams() {
    const cached = getCache(CacheKeys.TEAMS_ALL);

    if (cached) {
      console.log('Cache teams HIT');
      return { data: cached, source: 'cache' };
    }
    
    console.log('cache teams MISS, querying DB');

    const result = await dockerPool.query('SELECT * FROM "allTeams"');
    const data = result.rows;
    
    // cache for a long time (maybe 1 day?) since data rarely changes
    // for testing, set to 5 minutes

    setCache(CacheKeys.TEAMS_ALL, data, 300);
    
    return { data, source: 'database' };
  },
  
  async getControls() {
    const cached = getCache(CacheKeys.CONTROLS_ALL);
    if (cached) {
      console.log('cache controls HIT');
      return { data: cached, source: 'cache' };
    }
    
    console.log('cache controls MISS, querying DB');
    const result = await dockerPool.query('SELECT * FROM "allTrustControls"');
    const data = result.rows;
    
    setCache(CacheKeys.CONTROLS_ALL, data, 300);
    
    return { data, source: 'database' };
  },
  
  async getFaqs() {
    const cached = getCache(CacheKeys.FAQS_ALL);
    if (cached) {
      console.log('cache FAQs HIT');
      return { data: cached, source: 'cache' };
    }
    
    console.log('cache FAQs MISS, querying DB');
    const result = await dockerPool.query('SELECT * FROM "allTrustFaqs"');
    const data = result.rows;
    
    setCache(CacheKeys.FAQS_ALL, data, 300);
    
    return { data, source: 'database' };
  },
  
  // clear cache (for admin UPDATE, DELETE)
  clearCache(type?: 'teams' | 'controls' | 'faqs') {
    if (!type) {
      clearCache(); // clear all
      console.log('all cache cleared');
      return;
    }
    
    const keyMap = {
      teams: CacheKeys.TEAMS_ALL,
      controls: CacheKeys.CONTROLS_ALL,
      faqs: CacheKeys.FAQS_ALL
    };
    
    clearCache(keyMap[type]);
    console.log(`cache ${type} cache cleared`);
  }
};