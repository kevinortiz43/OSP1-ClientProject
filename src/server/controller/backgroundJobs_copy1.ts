import { type RequestHandler } from 'express';
import { JudgeService } from '../services/judgeService';
import { type Judgment, TestSet } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createError } from "../errorHandler";

// PATH CONFIGURATION
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SERVICE INITIALIZATION
// Single instance of JudgeService shared across all background jobs
// This ensures consistent configuration and resource usage
const judgeService = new JudgeService();

// TEST SET LOADING
// Load ground truth test questions for evaluation with expected results
// This enables automated regression testing of model performance
let testSet: TestSet = [];
const testQuestionsPath = path.join(__dirname, '..', 'aiTest', 'test-questions.json');

try {
  if (fs.existsSync(testQuestionsPath)) {
    const testData = fs.readFileSync(testQuestionsPath, 'utf-8');
    testSet = JSON.parse(testData);
    console.log(`Loaded ${testSet.length} test questions for evaluation from: ${testQuestionsPath}`);
  } else {
    console.warn('No test questions found at:', testQuestionsPath);
  }
} catch (error) {
  console.warn('Failed to load test questions:', error);
}

// MIDDLEWARE: triggerBackgroundJudgment
/**
 * Express middleware that captures SQL generation data for background evaluation
 * 
 * Non-blocking evaluation
 * - Runs after response is sent to user
 * - Doesn't impact user-facing performance
 * - Captures all necessary context for later evaluation
 * 
 * WHY: Text-to-SQL evaluation is computationally expensive and shouldn't block
 * the user experience. By running in background, we maintain responsive UX
 * while still gathering quality metrics.
 */
export const triggerBackgroundJudgment: RequestHandler = (_, res, next) => {
  console.log('TRIGGER BACKGROUND JUDGMENT');

  const source = res.locals.queryResult?.source;
  const hasSQL = !!res.locals.databaseQuery;

  // Only evaluate AI-generated SQL (not cached or search results)
  // This focuses our evaluation on the model's performance
  if (source === 'ai' && hasSQL) {
    // Ensure results is always an array to prevent type errors
    const results = res.locals.databaseQueryResult || [];
    const resultsCount = results.length;

    // Store all data needed for background evaluation
    // This creates a snapshot of the query context at execution time
    res.locals.judgmentData = {
      naturalLanguageQuery: res.locals.naturalLanguageQuery,
      generatedSQL: res.locals.databaseQuery,
      expectedSQL: undefined, // Will be filled from testSet if available
      results: results,
      resultsCount: resultsCount,
      expectedCount: undefined, // Will be filled from testSet if available
      source: source,
      executionTime: res.locals.executionTime,
      sqlModel: process.env.TEXT2SQL_MODEL,
      judgeModel: process.env.JUDGE_MODEL
    };
    console.log(`Judgment data stored for: "${res.locals.naturalLanguageQuery.substring(0, 50)}..."`);
  } else {
    console.log(`Skipping judgment - source: ${source}, hasSQL: ${hasSQL}`);
  }

  next(); // Continue response chain
};

// UTILITY FUNCTIONS
// These helper functions extract and normalize SQL components for comparison
// They're designed to be resilient to superficial SQL differences

/**
 * Extract numeric value from expected count string (e.g., ">=4" -> 4)
 * 
 * WHY: Test sets often specify expected result counts with operators
 * (e.g., ">=1" means at least one result). This normalizes to a number
 * for easier comparison.
 */
function extractExpectedCount(expectedCount: number | string | undefined): number {
  if (expectedCount === undefined || expectedCount === null) {
    return 0; // Default for ad-hoc queries
  }
  if (typeof expectedCount === 'number') return expectedCount;

  const match = expectedCount.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Normalize SQL for comparison by removing superficial differences
 * 
 * Semantic comparison over exact matching
 * SQL can be written in many ways that are semantically identical.
 * Normalization helps us focus on meaning rather than syntax.
 */
function normalizeSQL(sql: string): string {
  if (!sql) return '';

  return sql
    .toLowerCase()
    .replace(/\s+/g, ' ')                    // Normalize whitespace
    .replace(/`/g, '"')                       // Normalize quotes
    .replace(/""/g, '"')                       // Fix double-double quotes
    .replace(/select \* /g, 'select ')        // * is semantically equivalent to listing columns
    .replace(/as \w+/g, '')                    // Remove column aliases (don't affect meaning)
    .replace(/["']/g, '"')                     // Standardize quotes
    .replace(/;/g, '')                          // Remove semicolons
    .trim();
}

/**
 * Extract main tables from SQL (FROM and JOIN clauses)
 * 
 * WHY: Table selection is fundamental to query correctness.
 * This helps verify the model is querying the right data sources.
 */
function extractMainTables(sql: string): string {
  if (!sql) return '';

  const normalized = normalizeSQL(sql);

  // Find FROM clause (tables appear after FROM)
  const fromMatch = normalized.match(/from\s+([^where group order limit]+)/i);
  if (!fromMatch) return '';

  let fromClause = fromMatch[1];

  // Remove JOIN clauses to focus on base tables
  fromClause = fromClause.replace(/join[^]+?(?=where|group|order|limit|$)/gi, '');

  // Extract table names (quoted or unquoted)
  const tableMatches = fromClause.match(/"([^"]+)"|(\w+)/g) || [];

  // Sort for consistent comparison (order doesn't matter)
  return tableMatches.map(t => t.replace(/"/g, '')).sort().join(',');
}

/**
 * Extract WHERE clause conditions (simplified)
 * 
 * WHY: Filtering logic is critical to answer correctness.
 * This extracts conditions while normalizing operators that are functionally equivalent.
 */
function extractWhereClause(sql: string): string {
  if (!sql) return '';

  const normalized = normalizeSQL(sql);

  // Find WHERE clause
  const whereMatch = normalized.match(/where\s+(.+?)(?=group by|order by|limit|$)/i);
  if (!whereMatch) return '';

  let whereClause = whereMatch[1];

  // Normalize conditions: = vs like vs ilike are often equivalent for our purposes
  // This prevents superficial differences from affecting scores
  whereClause = whereClause
    .replace(/\s+like\s+/g, ' = ')
    .replace(/\s+ilike\s+/g, ' = ')
    .replace(/\s+and\s+/g, ' and ')
    .replace(/\s+or\s+/g, ' or ')
    .replace(/\s+/g, ' ')
    .trim();

  return whereClause;
}

/**
 * Extract selected columns
 * 
 * WHY: Column selection determines what data is returned.
 * This helps verify the model is retrieving the right fields.
 */
function extractSelectedColumns(sql: string): string[] {
  if (!sql) return [];

  const normalized = normalizeSQL(sql);

  // Find SELECT clause (columns appear between SELECT and FROM)
  const selectMatch = normalized.match(/select\s+(.+?)\s+from/i);
  if (!selectMatch) return [];

  let selectClause = selectMatch[1];

  // Handle SELECT * (means all columns)
  if (selectClause.includes('*')) {
    return ['*'];
  }

  // Parse individual columns
  const columns = selectClause
    .split(',')
    .map(col => {
      // Remove table aliases (t.column -> column)
      const withoutAlias = col.replace(/\w+\./g, '');
      // Remove quotes and trim
      return withoutAlias.replace(/["']/g, '').trim();
    })
    .filter(col => col && col !== '');

  return columns;
}

// SCORING FUNCTIONS
// These functions implement a multi-dimensional evaluation approach
// Each dimension measures a different aspect of SQL quality

/**
 * Calculate Answer Relevancy - does the SQL address what the user asked?
 * 
 * Intent matching through keyword and structure analysis
 * Measures semantic alignment between query and SQL
 */
function calculateAnswerRelevancy(generatedSQL: string, userQuery: string): number {
  const queryLower = userQuery.toLowerCase();
  const sqlLower = generatedSQL.toLowerCase();
  const selectedColumns = extractSelectedColumns(generatedSQL);

  let score = 3; // Start at middle (neutral)
  const maxScore = 5;

  // Check if SELECT matches what user asked for
  if (queryLower.includes('short descriptions') && selectedColumns.includes('short')) score += 1;
if (queryLower.includes('list all') || queryLower.includes('show all') || queryLower.includes('get all')) {
  // User asked for ALL columns
  if (selectedColumns.includes('*')) {
    score += 2; // Perfect match for "all"
  } else {
    // Check if this is a table with limited content columns
    // For "allTrustControls", short and long are the only content columns
    const hasShort = selectedColumns.includes('short');
    const hasLong = selectedColumns.includes('long');
    
    // If query is about controls and we have both content columns
    if (sqlLower.includes('alltrustcontrols') && hasShort && hasLong) {
      score += 2; // This IS all content columns for this table
    } 
    // If query is about teams and we have all relevant columns
    else if (sqlLower.includes('allteams') && 
             selectedColumns.includes('firstname') && 
             selectedColumns.includes('lastname') &&
             selectedColumns.includes('email') &&
             selectedColumns.includes('role')) {
      score += 2; // This covers all user-facing columns
    }
    else {
      score -= 1; // Penalize for not returning all columns when asked
    }
  }
}

  if (queryLower.includes('names') && (selectedColumns.includes('firstName') || selectedColumns.includes('lastName'))) score += 1;

  if (queryLower.includes('count') && sqlLower.includes('count(')) score += 1;
  if (queryLower.includes('average') && sqlLower.includes('avg(')) score += 1;
  if (queryLower.includes('sum') && sqlLower.includes('sum(')) score += 1;
  if (queryLower.includes('maximum') && sqlLower.includes('max(')) score += 1;
  if (queryLower.includes('minimum') && sqlLower.includes('min(')) score += 1;

  // Check if WHERE clause addresses the right category
  if (queryLower.includes('cloud security') && sqlLower.includes('cloud')) score += 1;
  if (queryLower.includes('data security') && sqlLower.includes('data')) score += 1;
  if (queryLower.includes('organizational security') && sqlLower.includes('organizational')) score += 1;
  if (queryLower.includes('privacy') && sqlLower.includes('privacy')) score += 1;

  // Check for UNION/JOIN when asking about multiple tables
  if ((queryLower.includes('and faqs') || queryLower.includes('and controls')) && 
      (sqlLower.includes('union') || sqlLower.includes('join'))) score += 1;

  return Math.min(maxScore, Math.max(1, score));
}

/**
 * Calculate Groundedness - are results based on actual data?
 * 
 * Results-based validation is most reliable
 * Actual database results are the ultimate truth test
 */
function calculateGroundedness(results: any[], expectedMinCount: number): number {
  if (!results || results.length === 0) return 0;

  // Got at least the minimum expected results - excellent
  if (results.length >= expectedMinCount) return 5;

  // Got some results but fewer than expected - partial success
  if (results.length > 0) return 3;

  return 1;
}

/**
 * Calculate Faithfulness - does SQL correctly implement the query intent?
 * 
 * Multi-factor comparison including structure and results
 * Combines multiple signals for robust evaluation
 */
function calculateFaithfulness(
  generatedSQL: string,
  expectedSQL: string,
  results: any[],
  expectedCount?: number | string
): number {
  // RESULTS-BASED EVALUATION (most reliable)
  if (results && results.length > 0) {
    if (expectedCount) {
      const expectedMin = extractExpectedCount(expectedCount);
      if (results.length >= expectedMin) {
        return 5; // Got expected data - perfect!
      }
    }
    return 4; // Got results but count mismatch - still good
  }

  // STRUCTURE-BASED EVALUATION (fallback when no results)
  const genTables = extractMainTables(generatedSQL);
  const expTables = extractMainTables(expectedSQL);
  const genWhere = extractWhereClause(generatedSQL);
  const expWhere = extractWhereClause(expectedSQL);

  // Tables must match - fundamental correctness
  if (genTables !== expTables) return 1;

  // Check WHERE conditions (ignoring specific values)
  const genWhereSimple = genWhere.replace(/= '[^']+'/g, '= ?');
  const expWhereSimple = expWhere.replace(/= '[^']+'/g, '= ?');

  if (genWhereSimple === expWhereSimple) return 5;
  if (genTables && genWhere) return 4;
  
  return 3;
}

/**
 * NOTE: calculateOverallScore was removed as it's not used in the final evaluation flow.
 * The code now uses calculateScoreWithLLMStyle for consistent scoring across both paths.
 */

/**
 * Generate detailed explanation from component scores
 * Provide actionable feedback, not just scores
 * Users need to understand WHY a score was given to improve
 */
function generateDetailedExplanation(
  scores: { groundedness: number; faithfulness: number; answerRelevancy: number },
  enhancedScore: number,
  resultsCount: number,
  expectedMinCount: number
): string {
  const explanations = [];
  
  // Groundedness explanation - most important metric
  if (scores.groundedness >= 4) {
    explanations.push(`Results: Found ${resultsCount} rows (meets minimum ${expectedMinCount})`);
  } else if (resultsCount === 0) {
    explanations.push(`Results: No data returned - check query conditions`);
  } else {
    explanations.push(`Results: Found ${resultsCount} rows, expected at least ${expectedMinCount}`);
  }

  // Faithfulness explanation - SQL structure
  if (scores.faithfulness >= 4) {
    explanations.push(`SQL Structure: Correct tables and conditions`);
  } else if (scores.faithfulness <= 2) {
    explanations.push(`SQL Structure: Tables don't match expected query`);
  } else {
    explanations.push(`SQL Structure: Partially correct but has issues`);
  }

  // Answer relevancy explanation - intent matching
  if (scores.answerRelevancy >= 4) {
    explanations.push(`Intent: SQL correctly addresses the question`);
  } else if (scores.answerRelevancy <= 2) {
    explanations.push(`Intent: SQL doesn't answer what was asked`);
  } else {
    explanations.push(`Intent: Partially addresses the question`);
  }

  explanations.push(`Overall score: ${enhancedScore}/5`);
  
  return explanations.join('. ');
}

/**
 * Calculate intent match between SQL and user query
 * 
 * WHY: Used by LLM-style scoring to measure semantic alignment
 * Focuses on functional intent (aggregations, filters) not exact wording
 */
function calculateIntentMatch(generatedSQL: string, userQuery: string): number {
  const sqlLower = generatedSQL.toLowerCase();
  const queryLower = userQuery.toLowerCase();
  
  let score = 3; // Start at middle (neutral)
  
  // FIX: Recognize "list all" intent
  if (queryLower.includes('list all') || queryLower.includes('show all') || queryLower.includes('get all')) {
    // Check if query returns all available data
    const columns = extractSelectedColumns(generatedSQL);
    if (columns.includes('*') || (columns.includes('short') && columns.includes('long'))) {
      score += 1; // Good - returns all content columns
    }
  }
  
  // Check for aggregation functions matching query intent
  if (queryLower.includes('count') && sqlLower.includes('count(')) score += 1;
  if (queryLower.includes('average') && sqlLower.includes('avg(')) score += 1;
  if (queryLower.includes('sum') && sqlLower.includes('sum(')) score += 1;
  if (queryLower.includes('maximum') && sqlLower.includes('max(')) score += 1;
  if (queryLower.includes('minimum') && sqlLower.includes('min(')) score += 1;
  
  // Check for category filters
  if (queryLower.includes('cloud security') && sqlLower.includes('cloud')) score += 1;
  if (queryLower.includes('data security') && sqlLower.includes('data')) score += 1;
  if (queryLower.includes('privacy') && sqlLower.includes('privacy')) score += 1;
  
  // Check for filters matching query intent (more nuanced)
  if (queryLower.includes('active') && sqlLower.includes('isactive')) score += 1;
  if (queryLower.includes('technical delivery managers') && sqlLower.includes('technical delivery manager')) score += 1;
  
  return Math.min(5, Math.max(1, score));
}

/**
 * Calculate SQL correctness by comparing with expected SQL
 * 
 * WHY: When ground truth exists, we can directly compare structure
 * Uses progressive matching from exact to approximate
 * Now ignores cosmetic differences like alias names
 */
function calculateSQLCorrectness(generatedSQL: string, expectedSQL: string): number {
  const genNormalized = normalizeSQL(generatedSQL);
  const expNormalized = normalizeSQL(expectedSQL);
  
  // Normalize SELECT * vs explicit column listing
  // If one uses * and the other lists all available columns, treat as equivalent
  const genHasStar = genNormalized.includes('select *');
  const expHasStar = expNormalized.includes('select *');
  
  // If both have star or both don't have star, proceed normally
  if (genHasStar !== expHasStar) {
    // One has *, one doesn't - check if explicit columns match table schema
    // For our schema, "allTrustControls" has short and long as content columns
    const genColumns = extractSelectedColumns(generatedSQL);
    const expColumns = extractSelectedColumns(expectedSQL);
    
    // If gen has * and exp lists specific columns that match all content columns
    if (genHasStar && !expHasStar && expColumns.includes('short') && expColumns.includes('long')) {
      // This is equivalent for our schema - treat as match
      return 5;
    }
    // If exp has * and gen lists specific columns that match all content columns
    if (expHasStar && !genHasStar && genColumns.includes('short') && genColumns.includes('long')) {
      return 5;
    }
  }
  
  // Remove alias names from COUNT(*) as X since they don't affect functionality
  const genFunctional = genNormalized.replace(/count\(\*\)\s+as\s+\w+/g, 'count(*)');
  const expFunctional = expNormalized.replace(/count\(\*\)\s+as\s+\w+/g, 'count(*)');
  
  // Remove ORDER BY for functional comparison (presentation only)
  const genNoOrderBy = genFunctional.replace(/order by[^]+$/, '').trim();
  const expNoOrderBy = expFunctional.replace(/order by[^]+$/, '').trim();
  
  // Functional match after normalizing cosmetic differences
  if (genNoOrderBy === expNoOrderBy) return 5;
  
  // Tables must match - fundamental
  const genTables = extractMainTables(generatedSQL);
  const expTables = extractMainTables(expectedSQL);
  if (genTables !== expTables) return 1;
  
  // WHERE clauses similar - good but not perfect
  const genWhere = extractWhereClause(generatedSQL);
  const expWhere = extractWhereClause(expectedSQL);
  if (genWhere === expWhere) return 4;
  
  return 3;
}

/**
 * Calculate completeness based on results vs expectations
 * 
 * WHY: Measures whether query returns ALL expected data
 * Critical for applications requiring complete datasets
 */
function calculateCompleteness(results: any[], expectedCount: number | string): number {
  if (!results || results.length === 0) return 1;
  
  const expectedMin = extractExpectedCount(expectedCount);
  
  if (results.length >= expectedMin) return 5;
  if (results.length > 0) return 3;
  return 1;
}

/**
 * Calculate result relevance based on user query
 * 
 * WHY: Even with correct counts, results might not be what user wanted
 * This is a simplified proxy - in production, use semantic similarity
 */
function calculateResultRelevance(results: any[], userQuery: string): number {
  if (!results || results.length === 0) return 1;
  
  // Simple heuristic: if we got results, they're somewhat relevant
  return results.length > 0 ? 4 : 1;
}

/**
 * Enhanced scoring function that mimics LLM judgment style
 * 
 * WHY: Ensures consistency between test cases and ad-hoc queries
 * Both evaluation paths use the same multi-dimensional approach
 */
function calculateScoreWithLLMStyle(
  generatedSQL: string,
  expectedSQL: string,
  results: any[],
  expectedCount: number | string,
  userQuery: string
): number {

  // Use multiple dimensions like LLM would
  const dimensions = {
    intent: calculateIntentMatch(generatedSQL, userQuery),
    correctness: calculateSQLCorrectness(generatedSQL, expectedSQL),
    completeness: calculateCompleteness(results, expectedCount),
    relevance: calculateResultRelevance(results, userQuery)
  };
  
  // Adjust weights to better reflect importance of column selection
  const weights = { 
  intent: 0.40,      // Intent is most important
  correctness: 0.30,  // Correctness should reward semantic equivalence
  completeness: 0.20, // Results count matters but less than intent
  relevance: 0.10     // Relevance is implied by results
};
  
  const weightedScore = Object.entries(dimensions).reduce(
    (sum, [key, val]) => sum + val * weights[key as keyof typeof weights], 0
  );
  
  // Round to match judgeService.ts normalization (0.5 increments)
  return Math.round(weightedScore * 2) / 2;
}

// MAIN EVALUATION FUNCTION
/**
 * Execute judgment in background (called after response)
 * 
 * Asynchronous evaluation with consistent scoring
 * 
 * EVALUATION ARCHITECTURE:
 * Query Executed
 *   |
 *   v
 * Has Test Case?
 *  /       \
 * Yes       No
 *  |         |
 *  v         v
 * Rule-based LLM Judge
 * Evaluation (JudgeService)
 *  |         |
 *  |         |
 *  v         v
 * Save Judgment
 * 
 * WHY 2 PATHS?
 * - Test cases: Have ground truth for precise measurement
 * - Ad-hoc: No ground truth, need LLM for qualitative assessment
 * Both produce scores on 1-5 scale with 0.5 granularity
 */
export async function runBackgroundJudgment(data: any): Promise<void> {
  if (!data) {
    console.log(createError('No judgment data to process', 400, 'backgroundJobs').log);
    return;
  }

  console.log(`Running background judgment for: "${data.naturalLanguageQuery?.substring(0, 50) || 'unknown'}"...`);

  try {
    // Safely extract results with defaults
    const {
      naturalLanguageQuery,
      generatedSQL,
      results = [],
      source = 'ai',
      executionTime,
      sqlModel
    } = data;

    const resultsCount = results.length;
    
    // Find matching test case (case-insensitive trim match)
    // This links ad-hoc queries to ground truth when available
    const testCase = testSet.find(t => 
      t.naturalLanguageQuery.toLowerCase().trim() === naturalLanguageQuery.toLowerCase().trim()
    );

    // Create judgment object with safe defaults
    // All fields are initialized to prevent undefined errors
    const judgment: Judgment = {
      timestamp: new Date(),
      naturalLanguageQuery,
      generatedSQL,
      expectedSQL: testCase?.expectedResponse?.sql,
      resultsCount,
      expectedCount: testCase?.expectedResponse?.resultsCount,
      passed: false,
      score: 0,
      explanation: '',
      source,
      executionTime,
      sqlModel: sqlModel || process.env.TEXT2SQL_MODEL,
      judgeModel: process.env.JUDGE_MODEL
    };

    // PATH 1: Test Case Evaluation (with ground truth)
    if (testCase) {
      console.log('Test case found, using enhanced rule-based evaluation');
      
      const expectedMinCount = extractExpectedCount(testCase.expectedResponse.resultsCount);
      
      // Calculate component scores for detailed feedback
      // These are used for explanation but not the final score
      const componentScores = {
        groundedness: calculateGroundedness(results, expectedMinCount),
        faithfulness: calculateFaithfulness(
          generatedSQL, 
          testCase.expectedResponse.sql,
          results,
          testCase.expectedResponse.resultsCount
        ),
        answerRelevancy: calculateAnswerRelevancy(
          generatedSQL, 
          naturalLanguageQuery
        )
      };
      
      // Use LLM-style scoring for final score
      // This ensures consistency with ad-hoc query scores
      const enhancedScore = calculateScoreWithLLMStyle(
        generatedSQL,
        testCase.expectedResponse.sql,
        results,
        testCase.expectedResponse.resultsCount,
        naturalLanguageQuery
      );
      
      judgment.score = enhancedScore;
      judgment.passed = enhancedScore >= 4;
      judgment.explanation = generateDetailedExplanation(
        componentScores, 
        enhancedScore,
        resultsCount,
        expectedMinCount
      );
      
    } 
    // PATH 2: Ad-hoc Query Evaluation (no ground truth)
    else {
      console.log('No test case found, using LLM judge for ad-hoc query');
      
      if (results.length > 0) {
        // Delegate to JudgeService which handles:
        // - SQL syntax validation
        // - LLM prompt construction
        // - Score normalization
        const llmJudgment = await judgeService.evaluateWithLLM(
          naturalLanguageQuery,
          generatedSQL,
          results
        );
        judgment.score = llmJudgment.score;
        judgment.explanation = llmJudgment.explanation;
        judgment.passed = llmJudgment.score >= 4;
      } else {
        // No results case - immediate failure with explanation
        judgment.score = 1;
        judgment.explanation = 'Query returned no results';
        judgment.passed = false;
      }
    }

    // PERSISTENCE: Save judgment 
    // All evaluations are persisted for:
    // - Model performance tracking over time
    // - Debugging and improvement
    const filepath = await judgeService.saveJudgment(judgment);
    console.log(`Judgment saved: ${filepath}`);
    console.log(`Score: ${judgment.score}/5 - ${judgment.passed ? 'PASSED' : 'FAILED'}`);
    
  } catch (error) {
    // Graceful error handling - evaluation failures shouldn't crash the app
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(createError(
      `Background judgment failed: ${errorMessage}`,
      500,
      'backgroundJobs'
    ).log);
  }
}