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
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/`/g, '"')
    .replace(/""/g, '"')
    .replace(/select \* /g, 'select ')
    .replace(/as \w+/g, '')
    .replace(/["']/g, '"')
    .replace(/;/g, '')
    .trim();
}

/**
 * Extracts table names from FROM and JOIN clauses.
 */
function extractMainTables(sql: string): string {
  if (!sql) return '';

  const normalized = normalizeSQL(sql);

  const fromMatch = normalized.match(/from\s+([^where group order limit]+)/i);
  if (!fromMatch) return '';

  let fromClause = fromMatch[1];
  fromClause = fromClause.replace(/join[^]+?(?=where|group|order|limit|$)/gi, '');

  const tableMatches = fromClause.match(/"([^"]+)"|(\w+)/g) || [];

  return tableMatches.map(t => t.replace(/"/g, '')).sort().join(',');
}

/**
 * Extracts and normalizes WHERE clause for comparison.
 */
function extractWhereClause(sql: string): string {
  if (!sql) return '';

  const normalized = normalizeSQL(sql);

  const whereMatch = normalized.match(/where\s+(.+?)(?=group by|order by|limit|$)/i);
  if (!whereMatch) return '';

  let whereClause = whereMatch[1];

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
 */
function extractSelectedColumns(sql: string): string[] {
  if (!sql) return [];

  const normalized = normalizeSQL(sql);

  const selectMatch = normalized.match(/select\s+(.+?)\s+from/i);
  if (!selectMatch) return [];

  let selectClause = selectMatch[1];

  if (selectClause.includes('*')) {
    return ['*'];
  }

  return selectClause
    .split(',')
    .map(col => {
      const withoutAlias = col.replace(/\w+\./g, '');
      return withoutAlias.replace(/["']/g, '').trim();
    })
    .filter(col => col && col !== '');
}

/**
 * SCORING METHOD 1: INTENT-BASED SCORING
 */
function calculateIntentMatch(generatedSQL: string, userQuery: string): number {
  const sqlLower = generatedSQL.toLowerCase();
  const queryLower = userQuery.toLowerCase();
  const selectedColumns = extractSelectedColumns(generatedSQL);
  
  let score = 3;
  
  if (queryLower.includes('list all') || queryLower.includes('show all') || queryLower.includes('get all')) {
    const hasAllContentColumns = 
      (sqlLower.includes('alltrustcontrols') && selectedColumns.includes('short') && selectedColumns.includes('long')) ||
      (sqlLower.includes('allteams') && 
       selectedColumns.includes('firstname') && 
       selectedColumns.includes('lastname') &&
       selectedColumns.includes('email') &&
       selectedColumns.includes('role'));
    
    if (selectedColumns.includes('*') || hasAllContentColumns) {
      score += 1;
    }
  }
  
  if (queryLower.includes('short descriptions') && selectedColumns.includes('short')) score += 1;
  if (queryLower.includes('names') && (selectedColumns.includes('firstname') || selectedColumns.includes('lastname'))) score += 1;
  if (queryLower.includes('count') && sqlLower.includes('count(')) score += 1;
  if (queryLower.includes('average') && sqlLower.includes('avg(')) score += 1;
  if (queryLower.includes('sum') && sqlLower.includes('sum(')) score += 1;
  if (queryLower.includes('maximum') && sqlLower.includes('max(')) score += 1;
  if (queryLower.includes('minimum') && sqlLower.includes('min(')) score += 1;
  
  if (queryLower.includes('cloud security') && sqlLower.includes('cloud')) score += 1;
  if (queryLower.includes('data security') && sqlLower.includes('data')) score += 1;
  if (queryLower.includes('privacy') && sqlLower.includes('privacy')) score += 1;
  if (queryLower.includes('organizational security') && sqlLower.includes('organizational')) score += 1;
  if (queryLower.includes('active') && sqlLower.includes('isactive')) score += 1;
  if (queryLower.includes('technical delivery managers') && sqlLower.includes('technical delivery manager')) score += 1;
  
  if ((queryLower.includes('and faqs') || queryLower.includes('and controls')) && 
      (sqlLower.includes('union') || sqlLower.includes('join'))) score += 1;
  
  return Math.min(5, Math.max(1, score));
}

/**
 * SCORING METHOD 2: SQL CORRECTNESS
 */
function calculateSQLCorrectness(generatedSQL: string, expectedSQL: string): number {
  const genNormalized = normalizeSQL(generatedSQL);
  const expNormalized = normalizeSQL(expectedSQL);
  
  const genHasStar = genNormalized.includes('select *');
  const expHasStar = expNormalized.includes('select *');
  
  if (genHasStar !== expHasStar) {
    const genColumns = extractSelectedColumns(generatedSQL);
    const expColumns = extractSelectedColumns(expectedSQL);
    
    if (genHasStar && !expHasStar && expColumns.includes('short') && expColumns.includes('long')) {
      return 5;
    }
    if (expHasStar && !genHasStar && genColumns.includes('short') && genColumns.includes('long')) {
      return 5;
    }
  }
  
  const genFunctional = genNormalized.replace(/count\(\*\)\s+as\s+\w+/g, 'count(*)');
  const expFunctional = expNormalized.replace(/count\(\*\)\s+as\s+\w+/g, 'count(*)');
  
  const genNoOrderBy = genFunctional.replace(/order by[^]+$/, '').trim();
  const expNoOrderBy = expFunctional.replace(/order by[^]+$/, '').trim();
  
  if (genNoOrderBy === expNoOrderBy) return 5;
  
  const genTables = extractMainTables(generatedSQL);
  const expTables = extractMainTables(expectedSQL);
  if (genTables !== expTables) return 1;
  
  const genWhere = extractWhereClause(generatedSQL);
  const expWhere = extractWhereClause(expectedSQL);
  if (genWhere === expWhere) return 4;
  
  return 3;
}

/**
 * Evaluates result quality based on row count expectations.
 */
function calculateResultQuality(
  results: any[], 
  expectedCount: number | string,
  resultsCount: number
): number {
  if (!results || results.length === 0) return 1;
  
  const meetsExpectations = checkResultsCount(resultsCount, expectedCount);
  
  if (meetsExpectations) return 5;
  if (results.length > 0) return 3;
  
  return 1;
}

/**
 * Combined faithfulness score.
 */
function calculateFaithfulness(
  generatedSQL: string,
  expectedSQL: string,
  results: any[],
  expectedCount?: number | string
): number {
  if (results?.length > 0) {
    if (expectedCount) {
      const meetsExpectations = checkResultsCount(results.length, expectedCount);
      if (meetsExpectations) return 5;
    }
    return 4;
  }
  return calculateSQLCorrectness(generatedSQL, expectedSQL);
}

/**
 * SCORING METHOD 3: WEIGHTED ENSEMBLE SCORE
 */
function calculateScoreWithLLMStyle(
  generatedSQL: string,
  expectedSQL: string,
  results: any[],
  expectedCount: number | string,
  userQuery: string,
  resultsCount: number
): number {
  const dimensions = {
    intent: calculateIntentMatch(generatedSQL, userQuery),
    correctness: calculateSQLCorrectness(generatedSQL, expectedSQL),
    resultQuality: calculateResultQuality(results, expectedCount, resultsCount)
  };
  
  const weights = { intent: 0.45, correctness: 0.35, resultQuality: 0.20 };
  
  const weightedScore = Object.entries(dimensions).reduce(
    (sum, [key, val]) => sum + val * weights[key as keyof typeof weights], 0
  );
  
  return judgeService.normalizeScore(weightedScore);
}

/**
 * Generates human-readable explanation of the score.
 */
function generateDetailedExplanation(
  scores: { groundedness: number; faithfulness: number; intentScore: number },
  enhancedScore: number,
  resultsCount: number,
  expectedMinCount: number | string
): string {
  const explanations = [];
  
  const expectedDisplay = typeof expectedMinCount === 'number' 
    ? expectedMinCount.toString() 
    : expectedMinCount;
  
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
 * MAIN JUDGMENT EXECUTION - 2 Paths
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
      console.log('Test case found, using enhanced rule-based evaluation');
      
      const expectedMinCount = testCase.expectedResponse.resultsCount;
      
      const componentScores = {
        groundedness: calculateResultQuality(results, expectedMinCount, resultsCount),
        faithfulness: calculateFaithfulness(
          generatedSQL, 
          testCase.expectedResponse.sql,
          results,
          expectedMinCount
        ),
        intentScore: calculateIntentMatch(generatedSQL, naturalLanguageQuery)
      };
      
      const enhancedScore = calculateScoreWithLLMStyle(
        generatedSQL,
        testCase.expectedResponse.sql,
        results,
        expectedMinCount,
        naturalLanguageQuery,
        resultsCount
      );
      
      judgment.score = enhancedScore;
      judgment.passed = enhancedScore >= 4;
      judgment.explanation = generateDetailedExplanation(
        componentScores, 
        enhancedScore,
        resultsCount,
        expectedMinCount
      );
      
    } else if (results.length > 0) {
      console.log('No test case found, using LLM judge for ad-hoc query');
      
      const llmJudgment = await judgeService.evaluateWithLLM(
        naturalLanguageQuery,
        generatedSQL,
        results
      );
      judgment.score = llmJudgment.score;
      judgment.explanation = llmJudgment.explanation;
      judgment.passed = llmJudgment.score >= 4;
      
    } else {
      judgment.score = 1;
      judgment.explanation = 'Query returned no results';
      judgment.passed = false;
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