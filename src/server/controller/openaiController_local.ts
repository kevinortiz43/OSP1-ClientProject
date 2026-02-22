import { AIService } from '../services/aiService';
import db from '../sql_db/db_connect_agnostic';
import { dataService } from '../caching/dataService';
import { createError } from '../errorHandler';
import { generateSchemaDescription } from '../sql_db/schemas-helper';
import { type QueryResult, type OfflineAIOutput } from '../types';

const aiService = new AIService();

// ── Constants ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'what', 'who', 'where', 'when', 'why', 'how',
  'the', 'and', 'for', 'are', 'is',
  'tell', 'about', 'can', 'you', 'me', 'show', 'get', 'find'
]);

const AI_PATTERNS = {
  STRONG_INDICATORS: new Set([
    'average', 'avg', 'mean', 'count', 'total',
    'maximum', 'max', 'longest', 'highest',
    'minimum', 'min', 'shortest', 'lowest',
    'sum', 'per', 'each', 'group'
  ]),
  WEAK_INDICATORS: new Set([
    'greater', 'less', 'more', 'fewer',
    'than', 'above', 'below', 'under', 'over',
    'and', 'both', 'related', 'associated'
  ]),
  ENTITIES: new Set([
    'control', 'controls', 'faq', 'faqs',
    'team', 'teams', 'member', 'members'
  ])
};

const PHRASE_PATTERNS = [
  /\bhow many\b/i,
  /\bin each category\b/i,
  /\bby category\b/i,
  /\baverage response time\b/i,
  /\bcontrols? and faqs?\b/i,
  /\bfaqs? and controls?\b/i,
  /\bmention both\b/i,
  /\bresponsible for\b/i,
  /\bin charge of\b/i,
  /\bwhat controls\b/i,
  /\bboth .* and .*\b/i,
  /\beither .* or .*\b/i
];

// ── Helper Functions (unchanged) ─────────────────────────────────────────────

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(query: string): string {
  const words = normalizeQuery(query)
    .split(' ')
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
  return words.length > 0 ? words.join(' & ') : '';
}

function formatSearchResults(results: any[]): string {
  return results
    .map(result => {
      switch (result.source) {
        case 'trust_control':
          return `[Trust Control] ${result.title}\n${result.description}`;
        case 'trust_faq':
          return `[FAQ] ${result.title}\n${result.description}`;
        default:
          return `[Team] ${result.title} - ${result.description}`;
      }
    })
    .join('\n\n');
}

function requiresAIPath(query: string): boolean {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/);
  let score = 0;

  for (const word of words) {
    if (AI_PATTERNS.STRONG_INDICATORS.has(word)) score += 2;
    else if (AI_PATTERNS.WEAK_INDICATORS.has(word)) score += 1;
  }

  const mentionedEntities = words.filter(w => AI_PATTERNS.ENTITIES.has(w));
  const uniqueEntities = new Set(mentionedEntities);
  if (uniqueEntities.size >= 2) score += 2;

  for (const pattern of PHRASE_PATTERNS) {
    if (pattern.test(query)) { score += 3; break; }
  }

  if (/\d+\s*(hours?|minutes?|days?)/.test(query)) score += 2;

  const shouldUseAI = score >= 4;

  if (shouldUseAI) {
    console.log(`AI path (score: ${score})`, {
      entities: Array.from(uniqueEntities),
      hasAggregation: words.some(w => AI_PATTERNS.STRONG_INDICATORS.has(w)),
      hasComparison: /\d+/.test(query) && query.includes('than'),
      hasMultipleEntities: uniqueEntities.size >= 2
    });
  }

  return shouldUseAI;
}

async function fastTextSearch(query: string): Promise<{
  results: any[];
  source: 'search-cache' | 'search-db';
  shouldUseAI: boolean;
  executionTime: string;
}> {
  const searchStartTime = Date.now();
  const needsAI = requiresAIPath(query);
  const keywords = extractKeywords(query);

  if (!keywords) {
    const executionTime = `${Date.now() - searchStartTime}ms`;
    return { results: [], source: 'search-db', shouldUseAI: needsAI, executionTime };
  }

  console.log('Attempting cached search first...');
  const keywordList = keywords.split(' & ');
  const cachedResults = dataService.searchCachedData(keywordList);

  if (cachedResults.length > 0) {
    console.log(`Found ${cachedResults.length} matches in cache`);
    if (needsAI) console.log('Query requires AI but search results found');
    const executionTime = `${Date.now() - searchStartTime}ms`;
    return { results: cachedResults, source: 'search-cache', shouldUseAI: needsAI, executionTime };
  }

  console.log('No matches in cache, falling back to database search...');

  const searchQuery = `
    SELECT source, id, title, description, category, "searchText"
    FROM (
      SELECT 
        'trust_control' as source, id,
        short as title, long as description,
        category, "searchText", 1 as sort_priority
      FROM "allTrustControls"
      WHERE to_tsvector('english', "searchText") @@ to_tsquery('english', $1)
      
      UNION ALL
      
      SELECT 
        'trust_faq' as source, id,
        question as title, answer as description,
        category, "searchText", 2 as sort_priority
      FROM "allTrustFaqs"
      WHERE to_tsvector('english', "searchText") @@ to_tsquery('english', $1)
      
      UNION ALL
      
      SELECT 
        'team' as source, id,
        "firstName" || ' ' || "lastName" as title,
        role as description, category, "searchText", 3 as sort_priority
      FROM "allTeams"
      WHERE to_tsvector('english', "searchText") @@ to_tsquery('english', $1)
    ) AS combined_results
    ORDER BY sort_priority
    LIMIT 10
  `;

  const result = await db.query(searchQuery, [keywords]);
  const executionTime = `${Date.now() - searchStartTime}ms`;
  return { results: result.rows, source: 'search-db', shouldUseAI: needsAI, executionTime };
}

function createQueryResult(
  source: string,
  results: any[],
  formatted: string,
  sql: string | null = null,
  cached: boolean = false,
  cacheTime?: string
): QueryResult {
  const result: QueryResult = { source, results, formatted, sql, cached };
  if (cacheTime) result.cacheTime = cacheTime;
  return result;
}

// ── Main Function ───────────────────────────────────────────────────────────

export async function queryOfflineOpenAI(
  naturalLanguageQuery: string
): Promise<OfflineAIOutput> {

  if (!naturalLanguageQuery) {
    throw new Error(createError('naturalLanguageQuery not found', 400, 'openaiController').log);
  }

  console.log('Processing query:', naturalLanguageQuery);

  // Step 1: Normalize + check cache
  const normalizedQuery = normalizeQuery(naturalLanguageQuery);
  console.log('Checking cache...');
  const cacheStartTime = Date.now();
  const cachedResult = await dataService.getCachedSearch(normalizedQuery);

  if (cachedResult) {
    const executionTime = `${Date.now() - cacheStartTime}ms`;
    console.log('CACHE HIT - returning cached results');
    console.log('Cache retrieval execution time:', executionTime);
    
    return {
      queryResult: createQueryResult(
        'cache',
        cachedResult.results,
        cachedResult.formatted,
        null,
        true,
        cachedResult.timestamp
      ),
      databaseQuery: null,
      executionTime,
      sqlResults: null,
    };
  }

  console.log('CACHE MISS');

  // Step 2: Fast text search with smart path selection
  console.log('Fast path: Searching searchText...');
  const { results: searchResults, source: searchSource, shouldUseAI, executionTime: searchExecutionTime } = 
    await fastTextSearch(normalizedQuery);

  if (shouldUseAI) {
    console.log('Query requires AI processing - bypassing search results');
    console.log('Fast text search execution time:', searchExecutionTime);
  } else if (searchResults.length > 0) {
    console.log(`Found ${searchResults.length} direct matches`);
    console.log('Fast text search execution time:', searchExecutionTime);

    const formattedResults = formatSearchResults(searchResults);
    const resultData = {
      results: searchResults,
      formatted: formattedResults,
      timestamp: new Date().toISOString(),
    };

    await dataService.setCachedSearch(normalizedQuery, resultData);

    return {
      queryResult: createQueryResult(searchSource, searchResults, formattedResults, null, false),
      databaseQuery: null,
      executionTime: searchExecutionTime,
      sqlResults: null,
    };
  }

  // Step 3: AI SQL generation
  if (shouldUseAI) {
    console.log('Using AI path due to query complexity');
  } else {
    console.log('No direct matches found, falling back to AI path...');
  }
  
  console.log('Fast text search execution time:', searchExecutionTime);
  console.log('AI path: Generating schema from type definitions...');
  const aiStartTime = Date.now();

  const schemaDescription = generateSchemaDescription();
  const sqlQuery = await aiService.textToSQL({
    prompt: naturalLanguageQuery,
    schemaDescription,
    categories: [],
    instructions: '',
  });

  const executionTime = `${Date.now() - aiStartTime}ms`;
  console.log('Generated SQL:', sqlQuery);
  console.log('AI execution time:', executionTime);

  return {
    queryResult: createQueryResult('ai', [], '', sqlQuery, false),
    databaseQuery: sqlQuery,
    executionTime,
    sqlResults: null, 
  };
}