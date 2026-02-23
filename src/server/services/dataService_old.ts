// import { getCache, setCache, clearCache, clearCacheByPattern } from '../caching/cache';
// import db from '../sql_db/db_connect_agnostic'; 
// import { type CachedSearchResult } from '../types';

// export const CacheKeys = {
//   TEAMS_ALL: "teams:all",
//   CONTROLS_ALL: "controls:all",
//   FAQS_ALL: "faqs:all",
//   SEARCH_PREFIX: "search:", 
// };

// const SEARCH_CACHE_TTL = 300; // 5 minutes

// export const dataService = {
//   async getTeams() {
//     const cached = getCache(CacheKeys.TEAMS_ALL);

//     if (cached) {
//       console.log("Cache teams HIT");
//       return { data: cached, source: "cache" };
//     }

//     console.log("cache teams MISS, querying DB");

//     const result = await db.query('SELECT * FROM "allTeams"');  
//     const data = result.rows;

//     setCache(CacheKeys.TEAMS_ALL, data, 300);

//     return { data, source: "database" };
//   },

//   async getControls() {
//     const cached = getCache(CacheKeys.CONTROLS_ALL);
//     if (cached) {
//       console.log("cache controls HIT");
//       return { data: cached, source: "cache" };
//     }

//     console.log("cache controls MISS, querying DB");
//     const result = await db.query('SELECT * FROM "allTrustControls"');  
//     const data = result.rows;

//     setCache(CacheKeys.CONTROLS_ALL, data, 300);

//     return { data, source: "database" };
//   },

//   async getFaqs() {
//     const cached = getCache(CacheKeys.FAQS_ALL);
//     if (cached) {
//       console.log("cache FAQs HIT");
//       return { data: cached, source: "cache" };
//     }

//     console.log("cache FAQs MISS, querying DB");
//     const result = await db.query('SELECT * FROM "allTrustFaqs"'); 
//     const data = result.rows;

//     setCache(CacheKeys.FAQS_ALL, data, 300);

//     return { data, source: "database" };
//   },

//   clearCache(type?: "teams" | "controls" | "faqs" | "search") {
//     if (!type) {
//       clearCache(CacheKeys.TEAMS_ALL);
//       clearCache(CacheKeys.CONTROLS_ALL);
//       clearCache(CacheKeys.FAQS_ALL);
      
//       clearCacheByPattern(`${CacheKeys.SEARCH_PREFIX}*`);  
      
//       console.log("All cache cleared");
//       return;
//     }

//     if (type === "search") {
//       clearCacheByPattern(`${CacheKeys.SEARCH_PREFIX}*`);  
      
//       console.log("Search cache cleared");
//       return;
//     }

//     const keyMap = {
//       teams: CacheKeys.TEAMS_ALL,
//       controls: CacheKeys.CONTROLS_ALL,
//       faqs: CacheKeys.FAQS_ALL,
//     };

//     clearCache(keyMap[type]);
//     console.log(`Cache cleared for ${type}`);
//   },

//   async getCachedSearch(normalizedQuery: string): Promise<CachedSearchResult | null> {
//     const cacheKey = `${CacheKeys.SEARCH_PREFIX}${normalizedQuery}`; 
//     const cached = getCache<CachedSearchResult>(cacheKey);
    
//     if (cached) {
//       console.log(`Search cache HIT: ${normalizedQuery}`);
//       return cached;
//     }
    
//     console.log(`Search cache MISS: ${normalizedQuery}`);
//     return null;
//   },

//   async setCachedSearch(normalizedQuery: string, resultData: CachedSearchResult): Promise<void> {
//     const cacheKey = `${CacheKeys.SEARCH_PREFIX}${normalizedQuery}`; 
//     const cacheData: CachedSearchResult = {
//       results: resultData.results,
//       formatted: resultData.formatted,
//       timestamp: new Date().toISOString(),
//     };
    
//     setCache(cacheKey, cacheData, SEARCH_CACHE_TTL);
//     console.log(`Search cache SET: ${normalizedQuery}`);
//   },

//   searchCachedData(keywords: string[]): Array<{
//     source: 'trust_control' | 'trust_faq' | 'team';
//     id: number;
//     title: string;
//     description: string;
//     category: string;
//     searchText: string;
//   }> {

//     const results = [];
//     const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
    
//     const matches = (searchText: string): boolean => {
//       const text = searchText.toLowerCase();
//       return Array.from(keywordSet).some(keyword => text.includes(keyword));
//     };

//     const controls = getCache(CacheKeys.CONTROLS_ALL);
//     if (controls && Array.isArray(controls)) {
//       controls.forEach((item: any) => {
//         if (matches(item.searchText || '')) {
//           results.push({
//             source: 'trust_control',
//             id: item.id,
//             title: item.short,
//             description: item.long,
//             category: item.category,
//             searchText: item.searchText
//           });
//         }
//       });
//     }

//     const faqs = getCache(CacheKeys.FAQS_ALL);
//     if (faqs && Array.isArray(faqs)) {
//       faqs.forEach((item: any) => {
//         if (matches(item.searchText || '')) {
//           results.push({
//             source: 'trust_faq',
//             id: item.id,
//             title: item.question,
//             description: item.answer,
//             category: item.category,
//             searchText: item.searchText
//           });
//         }
//       });
//     }

//     const teams = getCache(CacheKeys.TEAMS_ALL);
//     if (teams && Array.isArray(teams)) {
//       teams.forEach((item: any) => {
//         if (matches(item.searchText || '')) {
//           results.push({
//             source: 'team',
//             id: item.id,
//             title: `${item.firstName || ''} ${item.lastName || ''}`.trim(),
//             description: item.role,
//             category: item.category,
//             searchText: item.searchText
//           });
//         }
//       });
//     }

//     const priority = { trust_control: 1, trust_faq: 2, team: 3 };
//     return results.sort((a, b) => priority[a.source] - priority[b.source]).slice(0, 10);
//   }
// };