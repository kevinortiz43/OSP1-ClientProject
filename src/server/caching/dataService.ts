import { getCache, setCache, clearCache, hasCache } from './cache';
import db from '../sql_db/db_connect_agnostic';

export const CacheKeys = {
  TEAMS_ALL: 'teams:all',
  CONTROLS_ALL: 'controls:all',
  FAQS_ALL: 'faqs:all',
  SEARCH_PREFIX: 'search:',  // prefix for search result caching
};

export const dataService = {

  async getTeams() {
    const cached = getCache(CacheKeys.TEAMS_ALL);
    if (cached) {
      console.log('Cache teams HIT');
      return { data: cached, source: 'cache' };
    }
    console.log('Cache teams MISS, querying DB');
    const result = await db.query('SELECT * FROM "allTeams"');
    const data = result.rows;
    setCache(CacheKeys.TEAMS_ALL, data, 300);
    return { data, source: 'database' };
  },

  async getControls() {
    const cached = getCache(CacheKeys.CONTROLS_ALL);
    if (cached) {
      console.log('Cache controls HIT');
      return { data: cached, source: 'cache' };
    }
    console.log('Cache controls MISS, querying DB');
    const result = await db.query('SELECT * FROM "allTrustControls"');
    const data = result.rows;
    setCache(CacheKeys.CONTROLS_ALL, data, 300);
    return { data, source: 'database' };
  },

  async getFaqs() {
    const cached = getCache(CacheKeys.FAQS_ALL);
    if (cached) {
      console.log('Cache FAQs HIT');
      return { data: cached, source: 'cache' };
    }
    console.log('Cache FAQs MISS, querying DB');
    const result = await db.query('SELECT * FROM "allTrustFaqs"');
    const data = result.rows;
    setCache(CacheKeys.FAQS_ALL, data, 300);
    return { data, source: 'database' };
  },

  // Search result caching (used by openaiController_local)
  getCachedSearch(normalizedQuery: string) {
    const key = `${CacheKeys.SEARCH_PREFIX}${normalizedQuery}`;
    return getCache<{ results: any[]; formatted: string; timestamp: string }>(key);
  },

  setCachedSearch(normalizedQuery: string, data: { results: any[]; formatted: string; timestamp: string }) {
    const key = `${CacheKeys.SEARCH_PREFIX}${normalizedQuery}`;
    setCache(key, data, 300);
  },

  // In-memory keyword search across already-cached table data
  searchCachedData(keywords: string[]): any[] {
    const teams = getCache<any[]>(CacheKeys.TEAMS_ALL) || [];
    const controls = getCache<any[]>(CacheKeys.CONTROLS_ALL) || [];
    const faqs = getCache<any[]>(CacheKeys.FAQS_ALL) || [];

    const allData = [
      ...teams.map(r => ({ ...r, source: 'team', title: `${r.firstName} ${r.lastName}`, description: r.role })),
      ...controls.map(r => ({ ...r, source: 'trust_control', title: r.short, description: r.long })),
      ...faqs.map(r => ({ ...r, source: 'trust_faq', title: r.question, description: r.answer })),
    ];

    return allData.filter(item => {
      const searchText = `${item.title} ${item.description} ${item.searchText || ''}`.toLowerCase();
      return keywords.every(kw => searchText.includes(kw.toLowerCase()));
    });
  },

  clearCache(type?: 'teams' | 'controls' | 'faqs') {
    if (!type) {
      clearCache();
      console.log('All cache cleared');
      return;
    }
    const keyMap = {
      teams: CacheKeys.TEAMS_ALL,
      controls: CacheKeys.CONTROLS_ALL,
      faqs: CacheKeys.FAQS_ALL,
    };
    clearCache(keyMap[type]);
    console.log(`Cache ${type} cleared`);
  },
};