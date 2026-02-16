import { type RequestHandler } from 'express';
import { JudgeService, type Judgment } from '../services/judgeService';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// set up __dirname path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const judgeService = new JudgeService();

// Load test set on startup - OS-agnostic path
let testSet: Array<{ naturalLanguageQuery: string; expectedResponse: any }> = [];
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

/**
 * Trigger background judgment AFTER response is sent
 * Only runs for AI-generated SQL (not cache or search)
 */
export const triggerBackgroundJudgment: RequestHandler = (req, res, next) => {
  // DEBUG: Log everything
  console.log('=== TRIGGER BACKGROUND JUDGMENT ===');
  console.log('queryResult.source:', res.locals.queryResult?.source);
  console.log('databaseQuery:', res.locals.databaseQuery);
  console.log('databaseQueryResult length:', (res.locals.databaseQueryResult || []).length);

  const source = res.locals.queryResult?.source;
  const hasSQL = !!res.locals.databaseQuery;

  if (source === 'ai' && hasSQL) {

    // Ensure results is always an array
    const results = res.locals.databaseQueryResult || [];
    const resultsCount = results.length;

    // DEBUG: Log exactly what's being stored
    console.log('STORING JUDGMENT DATA:');
    console.log('  Query:', res.locals.naturalLanguageQuery);
    console.log('  SQL:', res.locals.databaseQuery);
    console.log('  Results count:', resultsCount);

    // FIX: Store ALL the data that runBackgroundJudgment needs
    res.locals.judgmentData = {
      naturalLanguageQuery: res.locals.naturalLanguageQuery,
      generatedSQL: res.locals.databaseQuery,
      results: results,  // Use the variable, not the original
      resultsCount: resultsCount,  // Use the variable, not the original
      expectedSQL: undefined,
      expectedCount: undefined,
      source: source,
      executionTime: res.locals.executionTime,
      sqlModel: process.env.TEXT2SQL_MODEL,
      // FIX: Add these fields that runBackgroundJudgment expects
      data: {  // Some parts of your code expect data.results
        results: results
      }
    };
    console.log(`Judgment data stored for: "${res.locals.naturalLanguageQuery.substring(0, 50)}..."`);
    console.log('  Judgment data structure:', Object.keys(res.locals.judgmentData));
  } else {
    console.log(`Skipping judgment - source: ${source}, hasSQL: ${hasSQL}`);
  }

  next();
};

/**
 * Extract numeric value from expected count string (e.g., ">=4" -> 4)
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
 * Normalize SQL for comparison (remove superficial differences)
 */
function normalizeSQL(sql: string): string {
  if (!sql) return '';

  return sql
    .toLowerCase()
    .replace(/\s+/g, ' ')                    // Normalize whitespace
    .replace(/`/g, '"')                       // Normalize quotes
    .replace(/""/g, '"')                       // Fix double-double quotes
    .replace(/select \* /g, 'select ')        // * is often equivalent to listing columns
    .replace(/as \w+/g, '')                    // Remove column aliases
    .replace(/["']/g, '"')                     // Standardize quotes
    .replace(/;/g, '')                          // Remove semicolons
    .trim();
}

/**
 * Extract main tables from SQL (FROM and JOIN clauses)
 */
function extractMainTables(sql: string): string {
  if (!sql) return '';

  const normalized = normalizeSQL(sql);

  // Find FROM clause
  const fromMatch = normalized.match(/from\s+([^where group order limit]+)/i);
  if (!fromMatch) return '';

  let fromClause = fromMatch[1];

  // Remove JOIN clauses to focus on main tables
  fromClause = fromClause.replace(/join[^]+?(?=where|group|order|limit|$)/gi, '');

  // Extract table names (quoted or unquoted)
  const tableMatches = fromClause.match(/"([^"]+)"|(\w+)/g) || [];

  return tableMatches.map(t => t.replace(/"/g, '')).sort().join(',');
}

/**
 * Extract WHERE clause conditions (simplified)
 */
function extractWhereClause(sql: string): string {
  if (!sql) return '';

  const normalized = normalizeSQL(sql);

  // Find WHERE clause
  const whereMatch = normalized.match(/where\s+(.+?)(?=group by|order by|limit|$)/i);
  if (!whereMatch) return '';

  let whereClause = whereMatch[1];

  // Normalize conditions: = vs like vs ilike are often equivalent for our purposes
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
 */
function extractSelectedColumns(sql: string): string[] {
  if (!sql) return [];

  const normalized = normalizeSQL(sql);

  // Find SELECT clause
  const selectMatch = normalized.match(/select\s+(.+?)\s+from/i);
  if (!selectMatch) return [];

  let selectClause = selectMatch[1];

  // Handle SELECT *
  if (selectClause.includes('*')) {
    return ['*'];
  }

  // Split by commas and clean up
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

/**
 * Calculate Answer Relevancy - does the response address what the user asked?
 */
function calculateAnswerRelevancy(generatedSQL: string, userQuery: string): number {
  const queryLower = userQuery.toLowerCase();
  const sqlLower = generatedSQL.toLowerCase();
  const selectedColumns = extractSelectedColumns(generatedSQL);

  let score = 0;
  const maxScore = 5;

  // 1. Check if SELECT matches what user asked for
  if (queryLower.includes('short descriptions') && selectedColumns.includes('short')) score += 1;
  if (queryLower.includes('list all') && selectedColumns.includes('*')) score += 1;
  if (queryLower.includes('count') && sqlLower.includes('count(')) score += 1;
  if (queryLower.includes('average') && sqlLower.includes('avg(')) score += 1;

  // 2. Check if WHERE clause addresses the right category
  if (queryLower.includes('cloud security') && sqlLower.includes('cloud')) score += 1;
  if (queryLower.includes('data security') && sqlLower.includes('data')) score += 1;
  if (queryLower.includes('organizational security') && sqlLower.includes('organizational')) score += 1;

  // 3. Check for UNION/JOIN when asking about multiple tables
  if (queryLower.includes('and faqs') && (sqlLower.includes('union') || sqlLower.includes('join'))) score += 1;
  if (queryLower.includes('and controls') && (sqlLower.includes('union') || sqlLower.includes('join'))) score += 1;

  return Math.min(score, maxScore);
}

/**
 * Calculate Groundedness - are results based on actual data?
 */
function calculateGroundedness(results: any[], expectedMinCount: number): number {
  if (!results || results.length === 0) return 0;

  // If we got at least the minimum expected results
  if (results.length >= expectedMinCount) return 5;

  // If we got some results but fewer than expected
  if (results.length > 0) return 3;

  return 1;
}

/**
 * Calculate Faithfulness - does SQL correctly implement the query intent?
 */
function calculateFaithfulness(
  generatedSQL: string,
  expectedSQL: string,
  results: any[],
  expectedCount?: number | string
): number {
  // If we have actual results to compare (ideal case)
  if (results && results.length > 0) {
    // Check if count meets expectations
    if (expectedCount) {
      const expectedMin = extractExpectedCount(expectedCount);
      if (results.length >= expectedMin) {
        // We got the expected data - that's what matters!
        return 5;
      }
    }

    // If we have results at all, that's good
    if (results.length > 0) return 4;
  }

  // SQL structure comparison (much more lenient)
  // Extract main components directly without creating unused variables
  const genTables = extractMainTables(generatedSQL);
  const expTables = extractMainTables(expectedSQL);
  const genWhere = extractWhereClause(generatedSQL);
  const expWhere = extractWhereClause(expectedSQL);

  // Check if same tables (critical)
  if (genTables !== expTables) return 1;

  // Check if WHERE clause has same key conditions
  // (ignoring = vs LIKE differences)
  const genWhereSimple = genWhere.replace(/= '[^']+'/g, '= ?');
  const expWhereSimple = expWhere.replace(/= '[^']+'/g, '= ?');

  if (genWhereSimple === expWhereSimple) return 5;

  // If tables match and we have a WHERE clause at all
  if (genTables && genWhere) return 4;

  // Default
  return 3;
}

/**
 * Calculate overall score using weighted dimensions
 */
function calculateOverallScore(scores: {
  groundedness: number;
  faithfulness: number;
  answerRelevancy: number;
}): number {
  // Weights: groundedness (results) matters most
  const weights = {
    groundedness: 0.5,  // 50% - Did we get results?
    faithfulness: 0.3,   // 30% - Is SQL semantically correct?
    answerRelevancy: 0.2 // 20% - Does it answer the question?
  };

  const weightedScore =
    scores.groundedness * weights.groundedness +
    scores.faithfulness * weights.faithfulness +
    scores.answerRelevancy * weights.answerRelevancy;

  // Round to 1 decimal
  return Math.round(weightedScore * 10) / 10;
}

/**
 * Execute judgment in background (called after response)
 */
/**
 * Execute judgment in background (called after response)
 */
/**
 * Execute judgment in background (called after response)
 */
export async function runBackgroundJudgment(data: any): Promise<void> {
  if (!data) {
    console.log('No judgment data to process');
    return;
  }

  console.log(`Running background judgment for: "${data.naturalLanguageQuery?.substring(0, 50) || 'unknown'}"...`);
  console.log('  Received data keys:', Object.keys(data));

  try {
    // Safely extract results - handle both possible structures
    const results = data.results || (data.data?.results) || [];
    const resultsCount = data.resultsCount || results.length || 0;
    const generatedSQL = data.generatedSQL || '';
    const naturalLanguageQuery = data.naturalLanguageQuery || '';
    
    // Find matching test case
    const testCase = testSet.find(t => 
      t.naturalLanguageQuery.toLowerCase().trim() === naturalLanguageQuery.toLowerCase().trim()
    );

    // Create judgment with safe defaults
    const judgment: Judgment = {
      timestamp: new Date(),
      naturalLanguageQuery: naturalLanguageQuery,
      generatedSQL: generatedSQL,
      expectedSQL: testCase?.expectedResponse?.sql,
      resultsCount: resultsCount,
      expectedCount: testCase?.expectedResponse?.resultsCount,
      passed: false,
      score: 0,
      explanation: '',
      source: data.source || 'ai',
      executionTime: data.executionTime,
      sqlModel: data.sqlModel || process.env.TEXT2SQL_MODEL,
      judgeModel: process.env.JUDGE_MODEL
    };

    // Check if this is a test case
    if (testCase) {
      console.log('✓ Test case found, using rule-based evaluation');
      
      const expectedMinCount = extractExpectedCount(testCase.expectedResponse.resultsCount);
      
      const scores = {
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
      
      judgment.score = calculateOverallScore(scores);
      judgment.passed = scores.groundedness >= 4;
      
      const explanations = [];
      if (scores.groundedness >= 4) {
        explanations.push(`✓ Returns ${resultsCount} relevant results`);
      } else if (resultsCount === 0) {
        explanations.push(`✗ Returns no results - query may need adjustment`);
      } else {
        explanations.push(`⚠ Returns ${resultsCount} results (expected at least ${expectedMinCount})`);
      }
      
      judgment.explanation = explanations.join('. ');
      
    } else {
      console.log('ℹ No test case found, using LLM judge for ad-hoc query');
      
      // Only call LLM judge if we have results
      if (results.length > 0) {
        const llmJudgment = await judgeService.evaluateWithLLM(
          naturalLanguageQuery,
          generatedSQL,
          results
        );
        judgment.score = llmJudgment.score;
        judgment.explanation = llmJudgment.explanation;
        judgment.passed = llmJudgment.score >= 4;
      } else {
        // No results case
        judgment.score = 1;
        judgment.explanation = 'Query returned no results';
        judgment.passed = false;
      }
    }

    // Save to JSON file
    const filepath = await judgeService.saveJudgment(judgment);
    console.log(`Judgment saved: ${filepath}`);
    console.log(`   Score: ${judgment.score}/5 - ${judgment.passed ? 'PASSED' : 'FAILED'}`);
    
  } catch (error) {
    console.error('Background judgment failed:', error);
    console.error('   Error details:', error.message);
    console.error('   Stack:', error.stack);
  }
}

/**
 * Collect metrics placeholder
 */
export const collectMetrics: RequestHandler = (req, res, next) => {
  // Store metrics data for background processing
  res.locals.metricsData = {
    timestamp: new Date(),
    path: req.path,
    method: req.method,
    responseTime: res.locals.executionTime,
    source: res.locals.queryResult?.source,
    model: process.env.TEXT2SQL_MODEL,
    queryLength: res.locals.naturalLanguageQuery?.length || 0,
    resultsCount: (res.locals.databaseQueryResult || []).length,
    hasSQL: !!res.locals.databaseQuery
  };

  next();
};

export async function runMetricsCollection(data: any): Promise<void> {
  // Placeholder for future metrics collection
  console.log('Metrics collected (placeholder):', {
    ...data,
    timestamp: data.timestamp.toISOString()
  });
}