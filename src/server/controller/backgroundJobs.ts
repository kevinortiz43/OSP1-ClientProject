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
    console.log(`Loaded ${testSet.length} test questions`);
  }
} catch (error) {
  console.warn('Failed to load test questions:', error);
}

export const triggerBackgroundJudgment: RequestHandler = (_, res, next) => {
  const source = res.locals.queryResult?.source;
  const hasSQL = !!res.locals.databaseQuery;

  if (source === 'ai' && hasSQL) {
    res.locals.judgmentData = {
      naturalLanguageQuery: res.locals.naturalLanguageQuery,
      generatedSQL: res.locals.databaseQuery,
      results: res.locals.databaseQueryResult || [],
      resultsCount: res.locals.databaseQueryResult?.length || 0,
      source,
      executionTime: res.locals.executionTime,
      sqlModel: process.env.TEXT2SQL_MODEL,
      judgeModel: process.env.JUDGE_MODEL
    };
  }

  next();
};

/**
 * Simple pass/fail based on results count expectations
 */
function evaluateByCountOnly(
  resultsCount: number, 
  expectedCount: number | string
): { score: number; passed: boolean; explanation: string } {
  const meetsExpectations = checkResultsCount(resultsCount, expectedCount);
  
  if (meetsExpectations) {
    return {
      score: 5,
      passed: true,
      explanation: `Count OK: got ${resultsCount}, expected ${expectedCount}`
    };
  }
  
  if (resultsCount === 0) {
    return {
      score: 1,
      passed: false,
      explanation: `No results, expected ${expectedCount}`
    };
  }
  
  return {
    score: 3,
    passed: false,
    explanation: `Wrong count: got ${resultsCount}, expected ${expectedCount}`
  };
}

/**
 * Main judgment execution - 2 PATHS (1. if the naturalLanguageQuery is in test set, 2.) if naturalLanguageQuery NOT in test set
 */
export async function runBackgroundJudgment(data: any): Promise<void> {
  if (!data) {
    console.log(createError('No judgment data', 400, 'backgroundJobs').log);
    return;
  }

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
    
    // Find test case - exact match only
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

    // PATH 1: Test case exists - deterministic count-based evaluation
    if (testCase) {
      console.log('Path 1: Test case found - using count-based evaluation');
      
      const evaluation = evaluateByCountOnly(
        resultsCount, 
        testCase.expectedResponse.resultsCount
      );
      
      judgment.score = evaluation.score;
      judgment.passed = evaluation.passed;
      judgment.explanation = evaluation.explanation;
      
    } 
    // PATH 2: No test case - LLM judge
    else {
      console.log('Path 2: No test case - using LLM judge');
      
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
        // Empty results is always 1
        judgment.score = 1;
        judgment.explanation = 'Query returned no results - not enough data to tell if correct or not';
        judgment.passed = false;
      }
    }

    await judgeService.saveJudgment(judgment);
    console.log(`Score: ${judgment.score}/5 - ${judgment.passed ? 'PASS' : 'FAIL'}`);
    console.log(`Explanation: ${judgment.explanation}`);
    
  } catch (error) {
    console.error('Background judgment failed:', error);
  }
}