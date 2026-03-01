import { getCache, setCache, clearCache, clearCacheByPattern } from '../caching/cache';
import db from '../sql_db/db_connect_agnostic';
import { type CachedSearchResult } from '../types';


/**
 * CACHE SERVICE
 * 
 * A DEVELOPMENT TOOL designed for rapid prototyping, NOT production use.
 * 
 * Purpose:
 * - Provide quick in-memory caching (not heavy Redis implementation)
 * - Test workflow integration before implementing proper caching strategies
 * - Mock the behavior of a caching system
 * 
 * Limitations:
 * - Works only with small datasets
 */

export const CacheKeys = {
  TEAMS_ALL: 'teams:all',
  CONTROLS_ALL: 'controls:all',
  FAQS_ALL: 'faqs:all',
  SEARCH_PREFIX: 'search:',  
};

const SEARCH_CACHE_TTL = 300;

// Cache configuration
const TABLE_CONFIG = [
  { key: CacheKeys.TEAMS_ALL, table: 'allTeams', name: 'teams' },
  { key: CacheKeys.CONTROLS_ALL, table: 'allTrustControls', name: 'controls' },
  { key: CacheKeys.FAQS_ALL, table: 'allTrustFaqs', name: 'faqs' }
];

export const dataService = {

  // Generic method for table data
  async getTableData(key: string, table: string, name: string) {
    const cached = getCache(key);
    if (cached) {
      console.log(`Cache ${name} HIT`);
      return { data: cached, source: 'cache' };
    }
    console.log(`Cache ${name} MISS, querying DB`);
    const result = await db.query(`SELECT * FROM "${table}"`);
    const data = result.rows;
    setCache(key, data, SEARCH_CACHE_TTL);
    return { data, source: 'database' };
  },

  // Load all table data at once (useful for warmup)
  async loadAllTableData() {
    const results = await Promise.all(
      TABLE_CONFIG.map(async ({ key, table, name }) => {
        const result = await this.getTableData(key, table, name);
        return { name, ...result };
      })
    );
    console.log('All table data loaded into cache');
    return results;
  },

  // Specific methods (keeping for backward compatibility)
  async getTeams() {
    return this.getTableData(CacheKeys.TEAMS_ALL, 'allTeams', 'teams');
  },

  async getControls() {
    return this.getTableData(CacheKeys.CONTROLS_ALL, 'allTrustControls', 'controls');
  },

  async getFaqs() {
    return this.getTableData(CacheKeys.FAQS_ALL, 'allTrustFaqs', 'faqs');
  },

  // Search result caching
  getCachedSearch(normalizedQuery: string): CachedSearchResult | null {
    const key = `${CacheKeys.SEARCH_PREFIX}${normalizedQuery}`;
    return getCache<CachedSearchResult>(key) || null;
  },

  setCachedSearch(normalizedQuery: string, data: CachedSearchResult): void {
    const key = `${CacheKeys.SEARCH_PREFIX}${normalizedQuery}`;
    setCache(key, data, SEARCH_CACHE_TTL);
  },

  // Added explicit return type and ensured return statement exists
  searchCachedData(keywords: string[]): Array<{
    source: 'trust_control' | 'trust_faq' | 'team';
    id: number;
    title: string;
    description: string;
    category: string;
    searchText: string;
  }> {
    const results: Array<{
      source: 'trust_control' | 'trust_faq' | 'team';
      id: number;
      title: string;
      description: string;
      category: string;
      searchText: string;
    }> = [];
    
    const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
    
    // Helper function to check if ANY keyword matches searchText
    const matches = (searchText: string): boolean => {
      const text = searchText.toLowerCase();
      return Array.from(keywordSet).some(keyword => text.includes(keyword));
    };

    // Search cached trust controls
    const controls = getCache<any[]>(CacheKeys.CONTROLS_ALL);
    if (controls && Array.isArray(controls)) {
      controls.forEach((item: any) => {
        if (matches(item.searchText || '')) {
          results.push({
            source: 'trust_control',
            id: item.id,
            title: item.short,
            description: item.long,
            category: item.category,
            searchText: item.searchText
          });
        }
      });
    }

    // Search cached FAQs
    const faqs = getCache<any[]>(CacheKeys.FAQS_ALL);
    if (faqs && Array.isArray(faqs)) {
      faqs.forEach((item: any) => {
        if (matches(item.searchText || '')) {
          results.push({
            source: 'trust_faq',
            id: item.id,
            title: item.question,
            description: item.answer,
            category: item.category,
            searchText: item.searchText
          });
        }
      });
    }

    // Search cached teams
    const teams = getCache<any[]>(CacheKeys.TEAMS_ALL);
    if (teams && Array.isArray(teams)) {
      teams.forEach((item: any) => {
        if (matches(item.searchText || '')) {
          results.push({
            source: 'team',
            id: item.id,
            title: `${item.firstName || ''} ${item.lastName || ''}`.trim(),
            description: item.role,
            category: item.category,
            searchText: item.searchText
          });
        }
      });
    }

    // Sort by source priority (controls first, then faqs, then teams)
    const priority = { trust_control: 1, trust_faq: 2, team: 3 };
    return results.sort((a, b) => priority[a.source] - priority[b.source]).slice(0, 10);
  },

  clearCache(type?: 'teams' | 'controls' | 'faqs' | 'search') {
    if (!type) {
      clearCache(); 
      console.log('All cache cleared');
      return;
    }
    
    if (type === 'search') {
      clearCacheByPattern(`${CacheKeys.SEARCH_PREFIX}*`);
      console.log('Search cache cleared');
      return;
    }

    const keyMap: Record<string, string> = {
      teams: CacheKeys.TEAMS_ALL,
      controls: CacheKeys.CONTROLS_ALL,
      faqs: CacheKeys.FAQS_ALL,
    };
    
    clearCache(keyMap[type]);
    console.log(`Cache ${type} cleared`);
  }
};