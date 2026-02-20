import { type RequestHandler } from "express";
import { AIService } from "../services/aiService";
import db from "../sql_db/db_connect_agnostic";
import { dataService } from "../services/dataService";
import { createError } from "../errorHandler";
import { generateSchemaDescription } from "../sql_db/schemas-helper";
import { type QueryResult } from "../types";

const aiService = new AIService();

// Common stop words extracted to constant for better maintainability
const STOP_WORDS = new Set([
  'what', 'who', 'where', 'when', 'why', 'how',
  'the', 'and', 'for', 'are', 'is',
  'tell', 'about', 'can', 'you', 'me', 'show', 'get', 'find'
]);

/**
 * Normalizes a query string for consistent cache key generation.
 * Consolidates multiple operations into a single chain.
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  
    .replace(/\s+/g, ' ') 
    .trim();
}

/**
 * Extracts meaningful keywords from query for full-text search.
 * Optimized to avoid multiple splits and joins. filters out STOP_WORDS.
 */
function extractKeywords(query: string): string {
  const words = normalizeQuery(query)
    .split(' ')
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
  
  return words.length > 0 ? words.join(' & ') : '';
}

/**
 * Formats search results for human-readable display.
 * Extracted to separate function for clarity and reusability.
 */
function formatSearchResults(results: any[]): string {
  return results
    .map(result => {
      switch (result.source) {
        case "trust_control":
          return `[Trust Control] ${result.title}\n${result.description}`;
        case "trust_faq":
          return `[FAQ] ${result.title}\n${result.description}`;
        default:
          return `[Team] ${result.title} - ${result.description}`;
      }
    })
    .join("\n\n");
}


/**
 * Efficient pattern matching using Sets and RegExp groups
 * Time complexity: O(n) where n = number of patterns (still efficient)
 */

const AI_PATTERNS = {
  // Terms that strongly indicate AI need (weight 2)
  STRONG_INDICATORS: new Set([
    'average', 'avg', 'mean', 'count', 'total',
    'maximum', 'max', 'longest', 'highest',
    'minimum', 'min', 'shortest', 'lowest',
    'sum', 'per', 'each', 'group'
  ]),
  
  // Terms that suggest but don't guarantee (weight 1)
  WEAK_INDICATORS: new Set([
    'greater', 'less', 'more', 'fewer',
    'than', 'above', 'below', 'under', 'over',
    'and', 'both', 'related', 'associated'
  ]),
  
  // Entity types from schema
  ENTITIES: new Set([
    'control', 'controls', 'faq', 'faqs', 
    'team', 'teams', 'member', 'members'
  ])
};

// Compiled regex patterns (static)
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


function requiresAIPath(query: string): boolean {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/);
  
  let score = 0;
  
  // Check individual words
  for (const word of words) {
    if (AI_PATTERNS.STRONG_INDICATORS.has(word)) score += 2;
    else if (AI_PATTERNS.WEAK_INDICATORS.has(word)) score += 1;
  }
  
  // Check for entity mentions
  const mentionedEntities = words.filter(w => AI_PATTERNS.ENTITIES.has(w));
  const uniqueEntities = new Set(mentionedEntities);
  
  // Multiple distinct entities suggests JOIN/UNION
  if (uniqueEntities.size >= 2) {
    score += 2;
  }
  
  // Check phrases
  for (const pattern of PHRASE_PATTERNS) {
    if (pattern.test(query)) {
      score += 3;
      break; // One phrase match is enough
    }
  }
  
  // Check for comparison patterns (numeric)
  if (/\d+\s*(hours?|minutes?|days?)/.test(query)) {
    score += 2;
  }

// natural language query complexity score to determine if AI path is necessary (can adjust value as needed)
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

/**
 * Enhanced fastTextSearch with smart path selection
 */
async function fastTextSearch(query: string): Promise<{
  results: any[];
  source: 'search-cache' | 'search-db';
  shouldUseAI: boolean;  // flag to indicate if AI path is recommended
}> {
  
  // First check if this query needs AI path
  const needsAI = requiresAIPath(query);
  
  const keywords = extractKeywords(query);

  // Early return if no meaningful keywords
  if (!keywords) {
    return { 
      results: [], 
      source: 'search-db',
      shouldUseAI: needsAI  // Still respect AI requirement
    };
  }

  // Try cached search first
  console.log("Attempting cached search first...");
  const keywordList = keywords.split(' & ');
  const cachedResults = dataService.searchCachedData(keywordList);
  
  if (cachedResults.length > 0) {
    console.log(`Found ${cachedResults.length} matches in cache`);
    
    // If query needs AI but we have search results, log this for debugging
    if (needsAI) {
      console.log('Query requires AI but search results found - consider if search is appropriate');
    }
    
    return { 
      results: cachedResults, 
      source: 'search-cache',
      shouldUseAI: needsAI
    };
  }

  console.log("No matches in cache, falling back to database search...");

  const searchQuery = `
    SELECT 
      source,
      id,
      title,
      description,
      category,
      "searchText"
    FROM (
      SELECT 
        'trust_control' as source,
        id,
        short as title,
        long as description,
        category,
        "searchText",
        1 as sort_priority
      FROM "allTrustControls"
      WHERE to_tsvector('english', "searchText") @@ to_tsquery('english', $1)
      
      UNION ALL
      
      SELECT 
        'trust_faq' as source,
        id,
        question as title,
        answer as description,
        category,
        "searchText",
        2 as sort_priority
      FROM "allTrustFaqs"
      WHERE to_tsvector('english', "searchText") @@ to_tsquery('english', $1)
      
      UNION ALL
      
      SELECT 
        'team' as source,
        id,
        "firstName" || ' ' || "lastName" as title,
        role as description,
        category,
        "searchText",
        3 as sort_priority
      FROM "allTeams"
      WHERE to_tsvector('english', "searchText") @@ to_tsquery('english', $1)
    ) AS combined_results
    ORDER BY sort_priority
    LIMIT 10
  `;

  const result = await db.query(searchQuery, [keywords]);
  
  return { 
    results: result.rows, 
    source: 'search-db',
    shouldUseAI: needsAI
  };
}

/*
 * Creates a standardized result object for consistent response format.
 */

function createQueryResult(
  source: string,
  results: any[],
  formatted: string,
  sql: string | null = null,
  cached: boolean = false,
  cacheTime?: string
): QueryResult {  
  const result: QueryResult = {
    source,
    results,
    formatted,
    sql,
    cached
  };
  
  if (cacheTime) {
    result.cacheTime = cacheTime;
  }
  
  return result;
}

/**
 * Main middleware that orchestrates the query processing pipeline.
 * 
 * PIPELINE (in order of increasing cost):
 * 1. Cache check (fastest) if already cached query result - Return previously computed results
 * 2. Full-text search (fast) - Search using searchText (path 1: search cache, path 2: search db)
 * 3. AI generation (slowest) - Generate SQL and execute it
 */
export const queryOfflineOpenAI: RequestHandler = async (_, res, next) => {
  try {
    const { naturalLanguageQuery } = res.locals;

    if (!naturalLanguageQuery) {
      return next(createError('naturalLanguageQuery not found', 400, 'openaiController'));
    }

    console.log("Processing query:", naturalLanguageQuery);

    // Step 1: normalize query & check cache (if query results already saved)
    const normalizedQuery = normalizeQuery(naturalLanguageQuery);
    
    console.log("Checking cache...");
    const cachedResult = await dataService.getCachedSearch(normalizedQuery);

    if (cachedResult) {
      console.log("CACHE HIT - returning cached results");
      
      res.locals.queryResult = createQueryResult(
        "cache",
        cachedResult.results,
        cachedResult.formatted,
        null,
        true,
        cachedResult.timestamp
      );
      
      res.locals.databaseQuery = null;
      return next();
    }

    console.log("CACHE MISS");

    // Step 2: fastTextSearch with smart path selection
    console.log("Fast path: Searching searchText...");
    const { results: searchResults, source: searchSource, shouldUseAI } = await fastTextSearch(normalizedQuery);

    // Check if AI path is required due to query complexity 
    if (shouldUseAI) {
      console.log("Query requires AI processing (aggregation/complex logic) - bypassing search results");
      // Skip to AI path even if search results exist
    }
    
    // Only use search results if:
    // 1. We have search results AND
    // 2. Query doesn't require AI path
    else if (searchResults.length > 0) {
      console.log(`Found ${searchResults.length} direct matches`);

      const formattedResults = formatSearchResults(searchResults);
      const resultData = {
        results: searchResults,
        formatted: formattedResults,
        timestamp: new Date().toISOString()
      };

      // Cache results for future queries
      await dataService.setCachedSearch(normalizedQuery, resultData);

      res.locals.queryResult = createQueryResult(
        searchSource,
        searchResults,
        formattedResults,
        null,
        false
      );
      
      res.locals.databaseQuery = null;
      return next();
    }

    // If we get here, either:
    // - No search results found, OR
    // - Query requires AI path (shouldUseAI = true)
    if (shouldUseAI) {
      console.log("Using AI path due to query complexity");
    } else {
      console.log("No direct matches found, falling back to AI path...");
    }

    // Step 3: AI SQL generation
    console.log("AI path: Generating schema from type definitions...");

    const startTime = Date.now();

    const schemaDescription = generateSchemaDescription();

    const sqlQuery = await aiService.textToSQL({
      prompt: naturalLanguageQuery,
      schemaDescription,
      categories: [],
      instructions: ''
    });

    const endTime = Date.now();
    res.locals.executionTime = `${endTime - startTime}ms`;

    console.log("Generated SQL:", sqlQuery);
    console.log('AI execution time:', res.locals.executionTime);

    res.locals.databaseQuery = sqlQuery;
    res.locals.queryResult = createQueryResult(
      "ai",
      [],
      "",
      sqlQuery,
      false
    );

    return next();

  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Unknown error occurred';

    return next(createError(
      `Failed to retrieve search results or generate SQL query: ${errorMessage}`,
      500,
      'openaiController'
    ));
  }
};