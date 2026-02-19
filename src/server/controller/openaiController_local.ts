import { type RequestHandler } from "express";
import { AIService } from "../services/aiService";
import db from "../sql_db/db_connect_agnostic";
import { dataService } from "../services/dataService";
import { createError } from "../errorHandler";
import { generateSchemaDescription } from "../sql_db/schemas-helper";

const aiService = new AIService();

/**
 * Normalizes a query string for consistent cache key generation.
 * 
 * PROCESS:
 * 1. Lowercase everything
 * 2. Remove punctuation (replace with spaces)
 * 3. Collapse multiple spaces into single spaces
 * 4. Trim leading/trailing spaces
 * 
 * EXAMPLE: "Who handles security?!" → "who handles security"
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()                // Convert to lowercase
    .trim()                        // Remove leading/trailing spaces
    .replace(/[^\w\s]/g, ' ')     // Replace punctuation with spaces
    .replace(/\s+/g, ' ')         // Collapse multiple spaces
    .trim();                       // Trim again (in case punctuation added spaces)
}

/**
 * Extracts meaningful keywords from query for full-text search.
 * 
 * PROCESS:
 * 1. Lowercase and clean the query
 * 2. Split into individual words
 * 3. Remove words that are too short (< 3 chars) - usually not meaningful
 * 4. Remove common English stop words that don't add search value
 * 5. Join remaining keywords with ' & ' for PostgreSQL tsquery format
 * 
 * EXAMPLE: "what is the response time for data security team" 
 *        → "response & time & data & security & team"
 * 
 * PostgreSQL tsquery uses '&' for AND, '|' for OR
 */
function extractKeywords(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')     // Remove punctuation
    .replace(/\s+/g, ' ')         // Collapse spaces
    .trim()
    .split(' ')                    // Split into words
    // Remove words that are too short to be meaningful
    .filter(word => word.length > 2)
    // Remove common English stop words (words that don't help searching) - add more as needed
    .filter(word => ![
      'what', 'who', 'where', 'when', 'why', 'how',  // Question words
      'the', 'and', 'for', 'are', 'is',              // Common articles/conjunctions
      'tell', 'about'                                 // Common verbs
    ].includes(word))
    .join(' & ');                  // Format for PostgreSQL tsquery
}

/**
 * Performs full-text search across all 3 tables using pre-concatenated searchText column.
 * 
 * A pre-concatenated searchText column is a database technique where multiple fields (e.g., FirstName, LastName, role, etc.) 
 * are combined into a single, dedicated text column (SearchText) to improve search performance and simplify queries. 
 * Instead of searching across multiple different columns, the system only needs to scan this single column.
 * 
 * WHY: searchText as "fast path" than AI generation because:
 * 1. Direct database query (no AI latency)
 * 2. Uses PostgreSQL's optimized full-text search 
 * 3. No network calls to AI service
 * 
 * The searchText column is pre-concatenated at insert/update time with all searchable text,
 * making searches very efficient (single column search instead of multiple columns).
 * 
 * Returns results from all 3 tables with a sort_priority:
 * 1 = Trust Controls (most relevant)
 * 2 = FAQs 
 * 3 = Team members
 */

async function fastTextSearch(query: string): Promise<{
  results: any[];
  source: 'search-cache' | 'search-db';
}> {
  const keywords = extractKeywords(query);

  // If no meaningful keywords after filtering, return empty results
  if (!keywords) {
    return { results: [], source: 'search-db' }; // default to db source
  }

  // Split keywords for cached search (removes ' & ' formatting)
  const keywordList = keywords.split(' & ').filter(k => k.length > 0);
  
  // TRY CACHED SEARCH FIRST (SUPER FAST - no database)
  console.log("Attempting cached search first...");
  const cachedResults = dataService.searchCachedData(keywordList);
  
  if (cachedResults.length > 0) {
    console.log(`Found ${cachedResults.length} matches in cache`);
    return { 
      results: cachedResults, 
      source: 'search-cache'  // Distinguish cache source
    };
  }

  console.log("No matches in cache, falling back to database search...");

// Single query searching all 3 tables with UNION ALL
// to_tsvector('english', "searchText") creates a searchable text vector
// @@ is the match operator for tsquery
// to_tsquery('english', $1) converts keywords to PostgreSQL search format
// "english": use english language rules (language-aware search) 
// Ex: WHERE to_tsvector('english', "searchText") @@ to_tsquery('english', 'response & time & data & security & team')
// Converts the "searchText" column into a searchable index, language-aware search
//"Find me rows where the searchText, when analyzed as English text, contains ALL of the words: response, time, data, security, and team (considering their various forms)"
// better than just doing LIKE '%security%' because it understands language
//  UNION ALL like taping 3 different lists together

  const searchQuery = `
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
    
    ORDER BY sort_priority
    LIMIT 10
  `;

  const result = await db.query(searchQuery, [keywords]);
  return { 
    results: result.rows, 
    source: 'search-db'  // Distinguish database source
  };
}

/**
 * Main middleware that orchestrates the query processing pipeline.
 * 
 * PIPELINE (in order of increasing cost):
 * 1. Cache check (fastest) - Return previously computed results
 * 2. Full-text search (fast) - First check if cached tables exist. If so, perform searchText search on cache.
 * Otherwise, database search using searchText
 * 3. AI generation (slowest) - Generate SQL and execute it via database query
  */
export const queryOfflineOpenAI: RequestHandler = async (_, res, next) => {
  try {
    const { naturalLanguageQuery } = res.locals;

    if (!naturalLanguageQuery) {
        return next(createError('naturalLanguageQuery not found', 400, 'openaiController'));
      };

    console.log("Processing query:", naturalLanguageQuery);

    // STAGE 1: NORMALIZATION
    // Create a consistent cache key regardless of punctuation/casing variations
    const normalizedQuery = normalizeQuery(naturalLanguageQuery);

    // STAGE 2: CACHE CHECK
    // Check if we've answered this exact normalized query before
    console.log("Checking cache...");
    const cachedResult = await dataService.getCachedSearch(normalizedQuery);

    if (cachedResult) {
      console.log("CACHE HIT - returning cached results");
      
      res.locals.queryResult = {
        source: "cache",
        results: cachedResult.results,
        formatted: cachedResult.formatted,
        sql: null,                            
        cached: true,
        cacheTime: cachedResult.timestamp,
      };

      res.locals.databaseQuery = null;
      return next(); // can exit middleware early if cachedResult is found
    }

    console.log("CACHE MISS");

    // STAGE 3: TEXT SEARCH
    // Fast path: Try full-text search first on cache, then database, before going to AI
    // Hopefully handles most common queries without AI latency/cost
    console.log("Fast path: Searching searchText...");
    const { results: searchResults, source: searchSource } = await fastTextSearch(normalizedQuery);

    if (searchResults.length > 0) {
      console.log(`Found ${searchResults.length} direct matches`);

      // Format results for human-readable display
      const formattedResults = searchResults
        .map((r) => {
          if (r.source === "trust_control") {
            return `[Security Control] ${r.title}\n${r.description}`;
          } else if (r.source === "trust_faq") {
            return `[FAQ] ${r.title}\n${r.description}`;
          } else {
            return `[Team] ${r.title} - ${r.description}`;
          }
        })
        .join("\n\n");

      // Cache the results for future queries
      const resultData = {
        results: searchResults,
        formatted: formattedResults,
        timestamp: new Date().toISOString() 
      };

      await dataService.setCachedSearch(normalizedQuery, resultData);

      res.locals.queryResult = {
        source: searchSource,
        results: searchResults,
        formatted: formattedResults,
        sql: null,
        cached: false,
      };

      res.locals.databaseQuery = null;
      return next();
    }

    console.log("No direct matches found, falling back to AI path...");

    // STAGE 4: AI SQL GENERATION
    // Expensive path: Only when cache miss AND no text search results
 
    console.log("AI path: Generating schema from type definitions...");

    const startTime = Date.now();

    // Generate schema description dynamically from the TypeScript interfaces
    // Ensures schema is always in sync with our type definitions
    const schemaDescription = generateSchemaDescription();

    const sqlQuery = await aiService.textToSQL({
      prompt: naturalLanguageQuery,
      schemaDescription: schemaDescription,  // passs in generated schema string
      categories: [],
      instructions: ''
    });

    const endTime = Date.now();
    res.locals.executionTime = `${endTime - startTime}ms`;

    console.log("Generated SQL:", sqlQuery);
    console.log('AI execution time:', res.locals.executionTime);

    res.locals.databaseQuery = sqlQuery; // for use in databaseController middleware
    res.locals.queryResult = { // for response to frontend
      source: "ai",
      sql: sqlQuery,
      results: null, // will be populated after querying database
      cached: false
    };

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
  }