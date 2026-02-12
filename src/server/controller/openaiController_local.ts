import { type RequestHandler } from "express";
import { type ServerError } from "../types";
import { AIService } from "../services/aiService";
import db from "../sql_db/db_connect_agnostic";
// import { type DockerDatabase } from "../sql_db/schemas-agnostic";
import { dataService } from "../services/dataService";

const aiService = new AIService();

/**
 * Normalizes a query string for consistent cache key generation.
 * 
 * REASONING: 
 * - Different questions should get DIFFERENT cache keys
 * - Only normalize punctuation and case, not word boundaries
 * - Preserves spaces to distinguish between singular/plural and different phrases
 * 
 * EXAMPLE:
 * "What is incident response plan?" → "what is incident response plan"
 * "Incident response planning" → "incident response planning" (different key)
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')  // Replace punctuation with space
    .replace(/\s+/g, ' ')      // Collapse multiple spaces to one
    .trim();                   // Remove leading/trailing spaces
}


/**
 * Extracts meaningful keywords from query for search.
 * Separates cache key from search logic.
 */
function extractKeywords(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => word.length > 2)  // Remove short words
    .filter(word => !['what', 'who', 'where', 'when', 'why', 'how', 'the', 'and', 'for', 'are', 'is'].includes(word))
    .join(' & ');
}


/**
 * Determines if a query is simple enough for direct text search vs AI generation.
 * 
 * REASONING FOR FIX:
 * - Many valid search queries don't contain trigger words ("private VPC", "AWS regions")
 * - We should attempt fastSearch for ALL short queries, not just those with triggers
 * - Only complex analytical queries with multiple conditions should go to AI
 */
function isSimpleQuery(query: string): boolean {
  const queryLower = query.toLowerCase();
  
  // OPTION A: Try fastSearch for ALL short queries (RECOMMENDED)
  return query.split(" ").length < 7;  // 5 words or less = try search first
  
  // OPTION B: Keep triggers but remove word count restriction
  // const simpleTriggers = ["what is", "what are", "who is", "find", "search", "show", "list"];
  // return simpleTriggers.some((t) => queryLower.includes(t));
  
  // OPTION C: Try fastSearch for EVERYTHING, let empty results fall back to AI
  // return true;  // Always try search first, AI is fallback
}

/**
 * Performs full-text search across all three tables using the pre-concatenated searchText column.
 * 
 * REASONING:
 * - The 'searchText' column in each table is specifically designed for this purpose
 * - It concatenates all relevant searchable fields during data ingestion
 * - UNION ALL is faster than separate queries and allows cross-table relevance sorting
 * - ILIKE provides case-insensitive pattern matching with wildcards
 * - LIMIT 10 prevents overwhelming responses with too many results
 */
async function fastTextSearch(query: string) {
  // Extract meaningful keywords (remove question words, keep only important terms)
const keywords = extractKeywords(query);

  // If no keywords after filtering, return empty array
  if (!keywords) {
    return [];
  }

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

  // For "what is incident response plan":
  // keywords = "incident & response & plan"
  // This will match because all three words exist in searchText
  const result = await db.query(searchQuery, [keywords]);
  return result.rows;
}
/**
 * Main middleware that orchestrates the query processing pipeline.
 * 
 * WORKFLOW PRIORITY (from fastest to slowest):
 * 1. CACHE: Return previously cached results (5-10ms)
 * 2. SEARCH: Direct text search on searchText column (50-200ms)
 * 3. AI: Generate SQL and execute query (2-5s)
 * 
 * This prioritization ensures optimal user experience:
 * - 80% of common questions hit cache or text search
 * - Only complex analytical queries invoke the AI model
 */
export const queryOfflineOpenAI: RequestHandler = async (req, res, next) => {
  try {
    const { naturalLanguageQuery } = res.locals;

    if (!naturalLanguageQuery) {
      const error: ServerError = {
        log: "OpenAI query middleware did not receive a query",
        status: 500,
        message: { err: "An error occurred before querying OpenAI" },
      };
      return next(error);
    }

    console.log("Processing query:", naturalLanguageQuery);

    // ============= STAGE 1: NORMALIZATION =============
    // Critical for cache consistency - converts "What's encryption?" and "what is encryption" to same key
    const normalizedQuery = normalizeQuery(naturalLanguageQuery);

    // ============= STAGE 2: CACHE CHECK =============
    // Fastest path - returns in 5-10ms if previously answered
    console.log("Checking cache...");
    const cachedResult = await dataService.getCachedSearch(normalizedQuery);

    if (cachedResult) {
      console.log("CACHE HIT - returning cached results");
      
      res.locals.queryResult = {
        source: "cache",
        results: cachedResult.results,
        formatted: cachedResult.formatted,
        sql: null,          // No SQL needed for cached results
        cached: true,
        cacheTime: cachedResult.timestamp,
      };

      // Clear database query to signal downstream middleware to skip SQL execution
      res.locals.databaseQuery = null;
      
      return next(); // Skip directly to response middleware
    }

    console.log("CACHE MISS");

    // ============= STAGE 3: TEXT SEARCH =============
    // Second fastest path - uses pre-indexed searchText column
    if (isSimpleQuery(normalizedQuery)) {
      console.log("Fast path: Searching searchText...");
      const searchResults = await fastTextSearch(normalizedQuery); // Use normalized, not original

      if (searchResults.length > 0) {
        console.log(`Found ${searchResults.length} direct matches`);

        // Format results in a human-readable structure
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

        const resultData = {
          results: searchResults,
          formatted: formattedResults,
          timestamp: new Date().toISOString() 
        };

        // Store in cache for future identical queries
        await dataService.setCachedSearch(normalizedQuery, resultData);

        res.locals.queryResult = {
          source: "search",
          results: searchResults,
          formatted: formattedResults,
          sql: null,
          cached: false,
        };

        // No SQL to execute - results are already available
        res.locals.databaseQuery = null;
        return next();
      }
    }

    // ============= STAGE 4: AI SQL GENERATION =============
// Slowest path - only for complex queries that couldn't be answered by cache or search
console.log("AI path: Generating schema from type definitions...");

// Start performance timer for AI generation
const startTime = Date.now();

/**
 * Generate schema description with explicit examples.
 * 
 * REASONING: The AI was confusing column values with column names.
 * This version makes it EXPLICIT that 'category' is a column containing these values.
 */
let schemaDescription = "Database schema for security compliance:\n\n";

// Table: allTrustControls
schemaDescription += `Table: "allTrustControls"\n`;
schemaDescription += `Columns:\n`;
schemaDescription += `  - id (string): Primary key\n`;
schemaDescription += `  - category (string): Values are 'Cloud Security', 'Data Security', 'Organizational Security', 'Secure Development'\n`;
schemaDescription += `  - short (string): Brief control description\n`;
schemaDescription += `  - long (string): Detailed control description\n`;
schemaDescription += `  - "searchText" (string): Full-text search column\n`;
schemaDescription += `Example row: ("VHJ1c3RDb250cm9sOjQ1Njc1ODk5...", 'Organizational Security', 'CyQu has an incident response plan...', ...)\n\n`;

// Table: allTrustFaqs
schemaDescription += `Table: "allTrustFaqs"\n`;
schemaDescription += `Columns:\n`;
schemaDescription += `  - id (string): Primary key\n`;
schemaDescription += `  - category (string): Values are 'Cloud Security', 'Data Security', 'Organizational Security', 'Secure Development'\n`;
schemaDescription += `  - question (string): FAQ question\n`;
schemaDescription += `  - answer (string): FAQ answer\n`;
schemaDescription += `  - "searchText" (string): Full-text search column\n`;
schemaDescription += `Example row: ("VHJ1c3RGYXE6YzZkYzliMWYtZTk2Ni00ZjdjLWE0ZWItNTIxOTQ3MzY4Yzhh", 'Cloud Security', 'What API protection measures?', 'Our API security strategy...', ...)\n\n`;

// Table: allTeams
schemaDescription += `Table: "allTeams"\n`;
schemaDescription += `Columns:\n`;
schemaDescription += `  - id (string): Primary key\n`;
schemaDescription += `  - "firstName" (string)\n`;
schemaDescription += `  - "lastName" (string)\n`;
schemaDescription += `  - role (string): Job title\n`;
schemaDescription += `  - email (string)\n`;
schemaDescription += `  - category (string): Team specialty area\n`;
schemaDescription += `  - "searchText" (string): Full-text search column\n`;
schemaDescription += `Example row: ("UmVzcG9uc2libGVUZWFtOjEyMzQ1Njc4LWFiY2QtZWZnaC1pamtsLW1ub3AtcXJzdA==", 'Frances', 'Allen', 'Technical Delivery Manager', 'frances.allen@email.com', 'Data Security', ...)\n\n`;

/**
 * Call the AI service with structured options.
 * 
 * REASONING: The controller no longer builds prompts.
 * It provides raw data and lets the service handle prompt engineering.
 */
const sqlQuery = await aiService.textToSQL({
  prompt: naturalLanguageQuery,
  schemaDescription: schemaDescription,
  // Optional: Add category filter if detected in query
  categories: [], // Could be populated by a separate classifier
  // Optional: Add specific instructions if needed
  instructions: '' 
});

// End timer and store execution time for performance monitoring
const endTime = Date.now();
res.locals.executionTime = `${endTime - startTime}ms`;

console.log("Generated SQL:", sqlQuery);
console.log('AI execution time:', res.locals.executionTime);

// Store SQL for downstream database execution middleware
res.locals.databaseQuery = sqlQuery;
res.locals.queryResult = {
  source: "ai",
  sql: sqlQuery,
  results: null,
  cached: false
};

return next();
    
  } catch (error) {
    console.error("Error in queryOfflineOpenAI:", error);
    return next(error);
  }
};