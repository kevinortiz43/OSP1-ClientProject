import { type RequestHandler } from 'express';
import { JudgeService, checkResultsCount } from '../services/judgeService';
import { type Judgment, type TestSet } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createError } from "../errorHandler";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const judgeService = new JudgeService();

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

export const triggerBackgroundJudgment: RequestHandler = (_, res, next) => {
  console.log('TRIGGER BACKGROUND JUDGMENT');

  const source = res.locals.queryResult?.source;
  const hasSQL = !!res.locals.databaseQuery;

  if (source === 'ai' && hasSQL) {
    const results = res.locals.databaseQueryResult || [];
    const resultsCount = results.length;

    res.locals.judgmentData = {
      naturalLanguageQuery: res.locals.naturalLanguageQuery,
      generatedSQL: res.locals.databaseQuery,
      expectedSQL: undefined,
      results: results,
      resultsCount: resultsCount,
      expectedCount: undefined,
      source: source,
      executionTime: res.locals.executionTime,
      sqlModel: process.env.TEXT2SQL_MODEL,
      judgeModel: process.env.JUDGE_MODEL
    };
    console.log(`Judgment data stored for: "${res.locals.naturalLanguageQuery.substring(0, 50)}..."`);
  } else {
    console.log(`Skipping judgment - source: ${source}, hasSQL: ${hasSQL}`);
  }

  next();
};

/**
 * Normalizes SQL for comparison by removing syntactic variations.
 * This allows us to compare the logical structure rather than exact strings.
 */
export function normalizeSQL(sql: string): string {
  if (!sql) return '';

  return sql
    .toLowerCase()                // Ignore case differences
    .replace(/\s+/g, ' ')         // Collapse multiple spaces/tabs/newlines
    .replace(/`/g, '"')           // Standardize backticks to double quotes
    .replace(/""/g, '"')          // Fix double-double quotes
    .replace(/select \* /g, 'select ') // Handle SELECT * variations
    .replace(/as \w+/g, '')       // Remove aliases (they don't affect logic)
    .replace(/["']/g, '"')        // Standardize all quotes to double quotes
    .replace(/;/g, '')            // Remove trailing semicolons
    .trim();
}

/**
 * Extracts table names from FROM and JOIN clauses.
 * fundamental to query correctness - wrong tables = wrong answer.
 * Used to compare if queries are querying the same data sources.
 */
function extractMainTables(sql: string): string {
  if (!sql) return '';

  const normalized = normalizeSQL(sql);

  // Extract everything after FROM until WHERE/GROUP/ORDER/LIMIT
  const fromMatch = normalized.match(/from\s+([^where group order limit]+)/i);
  if (!fromMatch) return '';

  let fromClause = fromMatch[1];
  // Remove JOIN clauses to focus on main tables
  fromClause = fromClause.replace(/join[^]+?(?=where|group|order|limit|$)/gi, '');

  // Match both quoted ("table") and unquoted (table) identifiers
  const tableMatches = fromClause.match(/"([^"]+)"|(\w+)/g) || [];

  // Sort for consistent comparison (table order doesn't matter logically)
  return tableMatches.map(t => t.replace(/"/g, '')).sort().join(',');
}

/**
 * Extracts and normalizes WHERE clause for comparison.
 * we can compare if filtering logic is equivalent.
 */
function extractWhereClause(sql: string): string {
  if (!sql) return '';

  const normalized = normalizeSQL(sql);

  // Extract WHERE clause until GROUP BY, ORDER BY, or LIMIT
  const whereMatch = normalized.match(/where\s+(.+?)(?=group by|order by|limit|$)/i);
  if (!whereMatch) return '';

  let whereClause = whereMatch[1];

  // Normalize comparison operators (LIKE/ILIKE are functionally equivalent to = for our purposes)
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
 * Extracts columns selected in the query.
 * Different column sets indicate different intents.
 */
function extractSelectedColumns(sql: string): string[] {
  if (!sql) return [];

  const normalized = normalizeSQL(sql);

  // Extract everything between SELECT and FROM
  const selectMatch = normalized.match(/select\s+(.+?)\s+from/i);
  if (!selectMatch) return [];

  let selectClause = selectMatch[1];

  if (selectClause.includes('*')) {
    return ['*']; // SELECT * means all columns
  }

  const columns = selectClause
    .split(',')
    .map(col => {
      // Remove table aliases (e.g., "t.firstName" -> "firstName")
      const withoutAlias = col.replace(/\w+\./g, '');
      return withoutAlias.replace(/["']/g, '').trim();
    })
    .filter(col => col && col !== '');

  return columns;
}

/**
 * SCORING METHOD 1: INTENT-BASED SCORING
 * 
 * WHY THIS APPROACH:
 * AI models still make subtle mistakes in understanding user intent. 
 * This rule-based scorer acts as a "safety net" that checks if the SQL actually 
 * answers what was asked, independent of exact SQL syntax.
 * 
 * SCORING LOGIC:
 * - Starts at baseline 3 (neutral)
 * - Adds points for matching intent indicators
 * - Caps at 5, floor at 1
 * 
 * EXAMPLE: "List all active team members with names and roles"
 * - Adds point if "isActive" appears in query
 * - Adds point if firstName/lastName columns are selected
 * - Adds point if role column is selected
 */
function calculateIntentMatch(generatedSQL: string, userQuery: string): number {
  const sqlLower = generatedSQL.toLowerCase();
  const queryLower = userQuery.toLowerCase();
  const selectedColumns = extractSelectedColumns(generatedSQL);
  
  let score = 3; // Start at neutral midpoint
  
  // Check for "list all" intent - user wants comprehensive data
  if (queryLower.includes('list all') || queryLower.includes('show all') || queryLower.includes('get all')) {
    const hasAllContentColumns = 
      (sqlLower.includes('alltrustcontrols') && selectedColumns.includes('short') && selectedColumns.includes('long')) ||
      (sqlLower.includes('allteams') && 
       selectedColumns.includes('firstname') && 
       selectedColumns.includes('lastname') &&
       selectedColumns.includes('email') &&
       selectedColumns.includes('role'));
    
    // SELECT * or selecting all meaningful columns indicates "all" intent
    if (selectedColumns.includes('*') || hasAllContentColumns) {
      score += 1;
    }
  }
  
  // Column-level intent matching
  if (queryLower.includes('short descriptions') && selectedColumns.includes('short')) score += 1;
  if (queryLower.includes('names') && (selectedColumns.includes('firstname') || selectedColumns.includes('lastname'))) score += 1;
  
  // Aggregation intent matching
  if (queryLower.includes('count') && sqlLower.includes('count(')) score += 1;
  if (queryLower.includes('average') && sqlLower.includes('avg(')) score += 1;
  if (queryLower.includes('sum') && sqlLower.includes('sum(')) score += 1;
  if (queryLower.includes('maximum') && sqlLower.includes('max(')) score += 1;
  if (queryLower.includes('minimum') && sqlLower.includes('min(')) score += 1;
  
  // Category filtering intent (domain-specific)
  if (queryLower.includes('cloud security') && sqlLower.includes('cloud')) score += 1;
  if (queryLower.includes('data security') && sqlLower.includes('data')) score += 1;
  if (queryLower.includes('privacy') && sqlLower.includes('privacy')) score += 1;
  if (queryLower.includes('organizational security') && sqlLower.includes('organizational')) score += 1;
  
  // Status filtering intent
  if (queryLower.includes('active') && sqlLower.includes('isactive')) score += 1;
  
  // Role-specific intent
  if (queryLower.includes('technical delivery managers') && sqlLower.includes('technical delivery manager')) score += 1;
  
  // Multi-table intent (joins/unions)
  if ((queryLower.includes('and faqs') || queryLower.includes('and controls')) && 
      (sqlLower.includes('union') || sqlLower.includes('join'))) score += 1;
  
  return Math.min(5, Math.max(1, score)); // Clamp between 1-5
}

/**
 * SCORING METHOD 2: SQL CORRECTNESS (Structural comparison with expected SQL)
 * 
 * WHY THIS APPROACH:
 * When we have an expected SQL (from test cases), we can do structural comparison.
 *we understand that exact string matching is too brittle, but we still
 * need to verify the query structure is correct.
 * 
 * 
 * SCORING LEVELS:
 * 5: Semantically identical (ignoring aliases/ORDER BY)
 * 4: Same tables and WHERE clause
 * 3: Same tables only
 * 2: Different tables but plausible attempt
 * 1: Completely wrong (different tables, wrong structure)
 */
function calculateSQLCorrectness(generatedSQL: string, expectedSQL: string): number {
  const genNormalized = normalizeSQL(generatedSQL);
  const expNormalized = normalizeSQL(expectedSQL);
  
  // Special case: SELECT * vs explicit column selection
  // Both can be correct if they cover the needed columns
  const genHasStar = genNormalized.includes('select *');
  const expHasStar = expNormalized.includes('select *');
  
  if (genHasStar !== expHasStar) {
    const genColumns = extractSelectedColumns(generatedSQL);
    const expColumns = extractSelectedColumns(expectedSQL);
    
    // If expected wants short/long and SELECT * gives them, that's fine
    if (genHasStar && !expHasStar && expColumns.includes('short') && expColumns.includes('long')) {
      return 5;
    }
    // Or if explicit columns match what SELECT * would give
    if (expHasStar && !genHasStar && genColumns.includes('short') && genColumns.includes('long')) {
      return 5;
    }
  }
  
  // Remove aliases and ORDER BY for semantic comparison
  const genFunctional = genNormalized.replace(/count\(\*\)\s+as\s+\w+/g, 'count(*)');
  const expFunctional = expNormalized.replace(/count\(\*\)\s+as\s+\w+/g, 'count(*)');
  
  const genNoOrderBy = genFunctional.replace(/order by[^]+$/, '').trim();
  const expNoOrderBy = expFunctional.replace(/order by[^]+$/, '').trim();
  
  // Level 5: Semantically identical
  if (genNoOrderBy === expNoOrderBy) return 5;
  
  // Level 3: Check if at least tables match
  const genTables = extractMainTables(generatedSQL);
  const expTables = extractMainTables(expectedSQL);
  if (genTables !== expTables) return 1; // Wrong tables = completely wrong
  
  // Level 4: Tables match AND WHERE clause matches
  const genWhere = extractWhereClause(generatedSQL);
  const expWhere = extractWhereClause(expectedSQL);
  if (genWhere === expWhere) return 4;
  
  // Level 2-3: Tables match but WHERE differs (partial correctness)
  return 3;
}

/**
 * Evaluates result quality based on row count expectations.
 * WHY: Even with correct SQL, database state affects results.
 * Empty results might mean correct query but no matching data.
 * 
 * FIXED: Now properly uses checkResultsCount and accepts parameters
 */
function calculateResultQuality(
  results: any[], 
  expectedCount: number | string,
  resultsCount: number  // Added parameter
): number {
  if (!results || results.length === 0) return 1;
  
  // Use the imported checkResultsCount function
  const meetsExpectations = checkResultsCount(resultsCount, expectedCount);
  
  if (meetsExpectations) return 5; // Met or exceeded expectations
  if (results.length > 0) return 3; // Got some results, but fewer than expected
  
  return 1; // No results
}

/**
 * Combined faithfulness score that prioritizes actual results over SQL structure.
 * WHY: Results are the ultimate truth. If we got good results, the SQL is likely
 * correct even if it looks different from expected.
 * 
 * FIXED: Removed extractExpectedCount, use checkResultsCount instead
 */
function calculateFaithfulness(
  generatedSQL: string,
  expectedSQL: string,
  results: any[],
  expectedCount?: number | string
): number {
  if (results && results.length > 0) {
    if (expectedCount) {
      // Use checkResultsCount instead of extractExpectedCount
      const meetsExpectations = checkResultsCount(results.length, expectedCount);
      if (meetsExpectations) {
        return 5; // Got expected results - SQL is faithful
      }
    }
    return 4; // Got some results, just fewer than expected
  }

  // Fall back to structural comparison if no results
  return calculateSQLCorrectness(generatedSQL, expectedSQL);
}

/**
 * SCORING METHOD 3: WEIGHTED ENSEMBLE SCORE ("Judge" approach)
 * 
 * WHY THIS APPROACH:
 * no single metric captures all aspects of
 * SQL quality. This combines multiple perspectives with domain-tuned weights:
 * 
 * - Intent (45%): Does it answer what was asked? (Heuristic, domain-aware)
 * - Correctness (35%): Is the SQL structure right? (Compare to expected)
 * - Result Quality (20%): Did we get the data we wanted? (Row count)
 * 
 * RATIONALE FOR WEIGHTS:
 * - Intent weighted highest because user satisfaction is paramount
 * - Correctness important but can vary (multiple SQL paths to same answer)
 * - Result Quality weighted lowest because it depends on database state
 * 
 * This mimics how an LLM judge would evaluate
 * 
 */
function calculateScoreWithLLMStyle(
  generatedSQL: string,
  expectedSQL: string,
  results: any[],
  expectedCount: number | string,
  userQuery: string,
  resultsCount: number  // Added parameter
): number {

  const dimensions = {
    intent: calculateIntentMatch(generatedSQL, userQuery),
    correctness: calculateSQLCorrectness(generatedSQL, expectedSQL),
    resultQuality: calculateResultQuality(results, expectedCount, resultsCount) // Pass resultsCount
  };
  
  const weights = { 
    intent: 0.45,
    correctness: 0.35,
    resultQuality: 0.20
  };
  
  const weightedScore = Object.entries(dimensions).reduce(
    (sum, [key, val]) => sum + val * weights[key as keyof typeof weights], 0
  );
  
  // Use the judge service to normalize to 1-5 scale
  return judgeService.normalizeScore(weightedScore);
}

/**
 * Generates human-readable explanation of the score.
 */
function generateDetailedExplanation(
  scores: { groundedness: number; faithfulness: number; intentScore: number },
  enhancedScore: number,
  resultsCount: number,
  expectedMinCount: number | string  // Change type to accept both
): string {
  const explanations = [];
  
  // Get a display-friendly expected value
  const expectedDisplay = typeof expectedMinCount === 'number' 
    ? expectedMinCount.toString() 
    : expectedMinCount;
  
  // Get minimum numeric value for comparison messages
  const minNumeric = typeof expectedMinCount === 'number' 
    ? expectedMinCount 
    : (parseInt(expectedMinCount.match(/\d+/)?.[0] || '0', 10));
  
  if (scores.groundedness >= 4) {
    explanations.push(`Results: Found ${resultsCount} rows (meets minimum ${expectedDisplay})`);
  } else if (resultsCount === 0) {
    explanations.push(`Results: No data returned - check query conditions`);
  } else {
    explanations.push(`Results: Found ${resultsCount} rows, expected at least ${expectedDisplay}`);
  }

  if (scores.faithfulness >= 4) {
    explanations.push(`SQL Structure: Correct tables and conditions`);
  } else if (scores.faithfulness <= 2) {
    explanations.push(`SQL Structure: Tables don't match expected query`);
  } else {
    explanations.push(`SQL Structure: Partially correct but has issues`);
  }

  if (scores.intentScore >= 4) {
    explanations.push(`Intent: SQL correctly addresses the question`);
  } else if (scores.intentScore <= 2) {
    explanations.push(`Intent: SQL doesn't answer what was asked`);
  } else {
    explanations.push(`Intent: Partially addresses the question`);
  }

  explanations.push(`Overall score: ${enhancedScore}/5`);
  
  return explanations.join('. ');
}

/**
 * MAIN JUDGMENT EXECUTION - 2 Paths:
 * 
 * PATH A: Test Case Match (Rule-based ensemble scoring)
 * - We have expected SQL and expected result count
 * - Use weighted scoring combining intent, correctness, and results
 * - Fast, deterministic, interpretable
 * - Good for regression testing and benchmarking
 * 
 * PATH B: No Test Case (LLM-based scoring)
 * - No expected SQL to compare against
 * - Use LLM to evaluate if results answer the question
 * - More flexible but slower and costlier
 * - Good for ad-hoc queries during development
 * 
 * RATIONALE FOR 2 PATHS:
 * In production AI systems, we need both regression testing (Path A)
 * and flexible evaluation (Path B). Path A gives us consistent metrics
 * for model improvement; Path B lets us evaluate real user queries
 * that weren't in our test set.
 */
export async function runBackgroundJudgment(data: any): Promise<void> {
  if (!data) {
    console.log(createError('No judgment data to process', 400, 'backgroundJobs').log);
    return;
  }

  console.log(`Running background judgment for: "${data.naturalLanguageQuery?.substring(0, 50) || 'unknown'}"...`);

  try {
    const {
      naturalLanguageQuery,
      generatedSQL,
      results = [],
      source = 'ai',
      executionTime,
      sqlModel
    } = data;

    const resultsCount = results.length;
    
    // Find matching test case (exact match on normalized query)
    const testCase = testSet.find(t => 
      t.naturalLanguageQuery.toLowerCase().trim() === naturalLanguageQuery.toLowerCase().trim()
    );

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

    if (testCase) {
      // PATH A: Test Case Match - Use ensemble rule-based scoring 
      console.log('Test case found, using enhanced rule-based evaluation');
      
      const expectedMinCount = testCase.expectedResponse.resultsCount;
      
      const componentScores = {
        groundedness: calculateResultQuality(results, testCase.expectedResponse.resultsCount, resultsCount), // Pass resultsCount
        faithfulness: calculateFaithfulness(
          generatedSQL, 
          testCase.expectedResponse.sql,
          results,
          testCase.expectedResponse.resultsCount
        ),
        intentScore: calculateIntentMatch(generatedSQL, naturalLanguageQuery)
      };
      
      // Combine into final score using weighted approach
      const enhancedScore = calculateScoreWithLLMStyle(
        generatedSQL,
        testCase.expectedResponse.sql,
        results,
        testCase.expectedResponse.resultsCount,
        naturalLanguageQuery,
        resultsCount // Pass resultsCount
      );
      
      judgment.score = enhancedScore;
      judgment.passed = enhancedScore >= 4; // Pass threshold = 4/5
      judgment.explanation = generateDetailedExplanation(
        componentScores, 
        enhancedScore,
        resultsCount,
        expectedMinCount
      );
      
    } else {
      // PATH B: No Test Case - Use LLM judge 
      console.log('No test case found, using LLM judge for ad-hoc query');
      
      if (results.length > 0) {
        // Let LLM evaluate if results answer the question
        const llmJudgment = await judgeService.evaluateWithLLM(
          naturalLanguageQuery,
          generatedSQL,
          results
        );
        judgment.score = llmJudgment.score;
        judgment.explanation = llmJudgment.explanation;
        judgment.passed = llmJudgment.score >= 4;
      } else {
        // No results = low score (can't be good if nothing returned)
        judgment.score = 1;
        judgment.explanation = 'Query returned no results';
        judgment.passed = false;
      }
    }

    const filepath = await judgeService.saveJudgment(judgment);
    console.log(`Judgment saved: ${filepath}`);
    console.log(`Score: ${judgment.score}/5 - ${judgment.passed ? 'PASSED' : 'FAILED'}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(createError(
      `Background judgment failed: ${errorMessage}`,
      500,
      'backgroundJobs'
    ).log);
  }
}