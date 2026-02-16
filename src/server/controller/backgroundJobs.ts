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
  console.log('=== BACKGROUND JUDGMENT DEBUG ===');
  console.log('queryResult.source:', res.locals.queryResult?.source);
  console.log('databaseQuery exists?', !!res.locals.databaseQuery);
  console.log('databaseQueryResult length:', (res.locals.databaseQueryResult || []).length);

  console.log('=== BACKGROUND JOBS INITIALIZATION ===');
  console.log('JUDGE_MODEL env:', process.env.JUDGE_MODEL);
  console.log('TEXT2SQL_MODEL env:', process.env.TEXT2SQL_MODEL);
  console.log('TEXT2SQL_URL env:', process.env.TEXT2SQL_URL);
  console.log('=====================================');
  
  const source = res.locals.queryResult?.source;
  const hasSQL = !!res.locals.databaseQuery;
  
  if (source === 'ai' && hasSQL) {
    res.locals.judgmentData = {
      naturalLanguageQuery: res.locals.naturalLanguageQuery,
      generatedSQL: res.locals.databaseQuery,
      results: res.locals.databaseQueryResult || [],
      resultsCount: (res.locals.databaseQueryResult || []).length,
      source: source,
      executionTime: res.locals.executionTime,
      sqlModel: process.env.TEXT2SQL_MODEL
    };
    console.log(`Judgment data stored for: "${res.locals.naturalLanguageQuery.substring(0, 50)}..."`);
  } else {
    console.log(`Skipping judgment - source: ${source}, hasSQL: ${hasSQL}`);
  }
  
  next();
};

/**
 * Extract numeric value from expected count string (e.g., ">=4" -> 4)
 */
function extractExpectedCount(expectedCount: number | string): number {
  if (typeof expectedCount === 'number') return expectedCount;
  const match = expectedCount.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Calculate Answer Relevancy - does the response address what the user asked?
 * Based on RAG evaluation frameworks [citation:5]
 */
function calculateAnswerRelevancy(generatedSQL: string, userQuery: string): number {
  const queryLower = userQuery.toLowerCase();
  const sqlLower = generatedSQL.toLowerCase();
  
  // Check if SQL addresses key query components
  let score = 0;
  const maxScore = 5;
  
  // 1. Does it SELECT appropriate columns?
  if (queryLower.includes('short descriptions') && sqlLower.includes('short')) score += 1;
  if (queryLower.includes('list all') && sqlLower.includes('*')) score += 1;
  if (queryLower.includes('count') && sqlLower.includes('count(')) score += 1;
  if (queryLower.includes('average') && sqlLower.includes('avg(')) score += 1;
  
  // 2. Does it filter correctly?
  if (queryLower.includes('cloud security') && sqlLower.includes('cloud')) score += 1;
  if (queryLower.includes('data security') && sqlLower.includes('data')) score += 1;
  
  // 3. Does it use appropriate JOIN/UNION logic?
  if (queryLower.includes('and faqs') && (sqlLower.includes('union') || sqlLower.includes('join'))) score += 1;
  
  return Math.min(score, maxScore);
}

/**
 * Calculate Groundedness - are results based on actual data? [citation:5][citation:9]
 */
function calculateGroundedness(results: any[], expectedMinCount: number): number {
  if (!results || results.length === 0) return 0;
  if (results.length >= expectedMinCount) return 5;
  if (results.length > 0) return 3;
  return 1;
}

/**
 * Calculate Faithfulness - does SQL correctly implement the query intent? [citation:1]
 */
function calculateFaithfulness(
  generatedSQL: string,
  expectedSQL: string,
  comparison: { exactMatch: boolean; normalizedMatch: boolean }
): number {
  if (comparison.exactMatch) return 5;
  if (comparison.normalizedMatch) return 4;
  
  // Check for critical errors
  const sqlLower = generatedSQL.toLowerCase();
  const expectedLower = expectedSQL.toLowerCase();
  
  // Penalize missing WHERE clauses when they're needed
  if (expectedLower.includes('where') && !sqlLower.includes('where')) return 2;
  
  // Penalize wrong JOIN types
  if (expectedLower.includes('union') && sqlLower.includes('join')) return 2;
  
  // Check if it has the right tables
  const hasRightTables = 
    (expectedLower.includes('alltrustcontrols') === sqlLower.includes('alltrustcontrols')) &&
    (expectedLower.includes('alltrustfaqs') === sqlLower.includes('alltrustfaqs')) &&
    (expectedLower.includes('allteams') === sqlLower.includes('allteams'));
  
  if (!hasRightTables) return 1;
  
  return 3; // Default for semantically similar but not matching
}

/**
 * Calculate overall score using weighted dimensions (RAGAS-inspired) [citation:1]
 */
function calculateOverallScore(scores: {
  groundedness: number;
  faithfulness: number;
  answerRelevancy: number;
}): number {
  // Weighted average: groundedness matters most (no results = failure)
  const weights = {
    groundedness: 0.5,
    faithfulness: 0.3,
    answerRelevancy: 0.2
  };
  
  const weightedScore = 
    scores.groundedness * weights.groundedness +
    scores.faithfulness * weights.faithfulness +
    scores.answerRelevancy * weights.answerRelevancy;
  
  return Math.round(weightedScore * 10) / 10; // Round to 1 decimal
}

/**
 * Execute judgment in background (called after response)
 */
export async function runBackgroundJudgment(data: any): Promise<void> {
  if (!data) {
    console.log('No judgment data to process');
    return;
  }

  console.log(`Running background judgment for: "${data.naturalLanguageQuery.substring(0, 50)}..."`);

  try {
    // Find matching test case FIRST
    const testCase = testSet.find(t => 
      t.naturalLanguageQuery.toLowerCase().trim() === data.naturalLanguageQuery.toLowerCase().trim()
    );

    // Create judgment with testCase available
    const judgment: Judgment = {
      timestamp: new Date(),
      naturalLanguageQuery: data.naturalLanguageQuery,
      // SQL comparison first
      generatedSQL: data.generatedSQL,
      expectedSQL: testCase?.expectedResponse.sql,
      // Results comparison
      resultsCount: data.resultsCount,
      expectedCount: testCase?.expectedResponse.resultsCount,
      // Evaluation results (will be set below)
      passed: false,
      score: 0,
      explanation: '',
      // Metadata
      source: data.source,
      executionTime: data.executionTime,
      sqlModel: process.env.TEXT2SQL_MODEL,
      judgeModel: process.env.JUDGE_MODEL
    };

    if (testCase) {
      // Calculate comparison metrics
      const comparison = judgeService.compareWithExpected(
        data.generatedSQL, 
        testCase.expectedResponse.sql
      );
      
      const expectedMinCount = extractExpectedCount(testCase.expectedResponse.resultsCount);
      
      // Calculate multi-dimensional scores [citation:1][citation:5]
      const scores = {
        groundedness: calculateGroundedness(data.results, expectedMinCount),
        faithfulness: calculateFaithfulness(
          data.generatedSQL, 
          testCase.expectedResponse.sql,
          comparison
        ),
        answerRelevancy: calculateAnswerRelevancy(
          data.generatedSQL, 
          data.naturalLanguageQuery
        )
      };
      
      // Calculate overall score
      judgment.score = calculateOverallScore(scores);
      
      // Determine pass/fail based on groundedness and faithfulness
      judgment.passed = scores.groundedness >= 4 && scores.faithfulness >= 3;
      
      // Build detailed explanation
      const explanations = [];
      if (scores.groundedness >= 4) {
        explanations.push(`✓ Returns ${data.resultsCount} relevant results`);
      } else if (data.resultsCount === 0) {
        explanations.push(`✗ Returns no results - query may need adjustment`);
      } else {
        explanations.push(`⚠ Returns ${data.resultsCount} results (expected at least ${expectedMinCount})`);
      }
      
      if (scores.faithfulness === 5) {
        explanations.push(`✓ SQL exactly matches expected structure`);
      } else if (scores.faithfulness >= 4) {
        explanations.push(`✓ SQL semantically correct`);
      } else if (scores.faithfulness >= 3) {
        explanations.push(`⚠ SQL works but could be optimized`);
      } else {
        explanations.push(`✗ SQL structure differs significantly from expected`);
      }
      
      judgment.explanation = explanations.join('. ');
      
      // Add semantic match note if applicable
      if (comparison.normalizedMatch && !comparison.exactMatch) {
        judgment.explanation += ' (semantic match)';
      }
      
    } else {
      // Use LLM judge for ad-hoc queries
      console.log('No test case found, using LLM judge...');
      const llmJudgment = await judgeService.evaluateWithLLM(
        data.naturalLanguageQuery,
        data.generatedSQL,
        data.results
      );
      judgment.score = llmJudgment.score;
      judgment.explanation = llmJudgment.explanation;
      judgment.passed = llmJudgment.score >= 4;
    }

    // Save to JSON file
    await judgeService.saveJudgment(judgment);
    console.log(`Judgment stored (score: ${judgment.score}/5) for: "${data.naturalLanguageQuery.substring(0, 50)}..."`);
  } catch (error) {
    console.error('Background judgment failed:', error);
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