import { type RequestHandler } from "express";
import { type ServerError } from "../types";
import { AIService } from "../services/aiService";
import db from "../sql_db/db_connect_agnostic";
import { dataService } from "../services/dataService";

const aiService = new AIService();

/**
 * Normalizes a query string for consistent cache key generation.
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts meaningful keywords from query for search.
 */
function extractKeywords(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => word.length > 2)
    .filter(word => !['what', 'who', 'where', 'when', 'why', 'how', 'the', 'and', 'for', 'are', 'is', 'tell', 'about'].includes(word))
    .join(' & ');
}

/**
 * Determines if a query is simple enough for direct text search vs AI generation.
 * FIXED: Always try fastSearch first for any query, only go to AI if no results found
 */
function shouldTryFastSearch(query: string): boolean {
  // Always try fast search for any query - it's faster and might have results
  return true;
}

/**
 * Performs full-text search across all three tables using the pre-concatenated searchText column.
 */
async function fastTextSearch(query: string) {
  const keywords = extractKeywords(query);

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

  const result = await db.query(searchQuery, [keywords]);
  return result.rows;
}

/**
 * Main middleware that orchestrates the query processing pipeline.
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
    const normalizedQuery = normalizeQuery(naturalLanguageQuery);

    // ============= STAGE 2: CACHE CHECK =============
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
      return next();
    }

    console.log("CACHE MISS");

    // ============= STAGE 3: TEXT SEARCH =============
    // FIXED: Always try fast search first for ANY query
    console.log("Fast path: Searching searchText...");
    const searchResults = await fastTextSearch(normalizedQuery);

    if (searchResults.length > 0) {
      console.log(`Found ${searchResults.length} direct matches`);

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

      await dataService.setCachedSearch(normalizedQuery, resultData);

      res.locals.queryResult = {
        source: "search",
        results: searchResults,
        formatted: formattedResults,
        sql: null,
        cached: false,
      };

      res.locals.databaseQuery = null;
      return next();
    }

    console.log("No direct matches found, falling back to AI path...");

    // ============= STAGE 4: AI SQL GENERATION =============
    console.log("AI path: Generating schema from type definitions...");

    const startTime = Date.now();

    // Generate schema description
    let schemaDescription = "Database schema for security compliance:\n\n";

    schemaDescription += `Table: "allTrustControls"\n`;
    schemaDescription += `Columns:\n`;
    schemaDescription += `  - id (string): Primary key\n`;
    schemaDescription += `  - category (string): Values are 'Cloud Security', 'Data Security', 'Organizational Security', 'Secure Development', 'Privacy', 'Security Monitoring'\n`;
    schemaDescription += `  - short (string): Brief control description\n`;
    schemaDescription += `  - long (string): Detailed control description\n`;
    schemaDescription += `  - searchText (string): Full-text search column\n\n`;

    schemaDescription += `Table: "allTrustFaqs"\n`;
    schemaDescription += `Columns:\n`;
    schemaDescription += `  - id (string): Primary key\n`;
    schemaDescription += `  - category (string): Values are 'Cloud Security', 'Data Security', 'Organizational Security', 'Secure Development', 'Privacy', 'Security Monitoring'\n`;
    schemaDescription += `  - question (string): FAQ question\n`;
    schemaDescription += `  - answer (string): FAQ answer\n`;
    schemaDescription += `  - searchText (string): Full-text search column\n\n`;

    schemaDescription += `Table: "allTeams"\n`;
    schemaDescription += `Columns:\n`;
    schemaDescription += `  - id (string): Primary key\n`;
    schemaDescription += `  - firstName (string)\n`;
    schemaDescription += `  - lastName (string)\n`;
    schemaDescription += `  - role (string): Job title\n`;
    schemaDescription += `  - email (string)\n`;
    schemaDescription += `  - category (string): Team specialty area\n`;
    schemaDescription += `  - searchText (string): Full-text search column\n\n`;

    const sqlQuery = await aiService.textToSQL({
      prompt: naturalLanguageQuery,
      schemaDescription: schemaDescription,
      categories: [],
      instructions: ''
    });

    const endTime = Date.now();
    res.locals.executionTime = `${endTime - startTime}ms`;

    console.log("Generated SQL:", sqlQuery);
    console.log('AI execution time:', res.locals.executionTime);

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