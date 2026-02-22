import { JudgeService, checkResultsCount } from '../services/judgeService';
import { type Judgment, type TestSet } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createError } from '../errorHandler';

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

// ── Types ────────────────────────────────────────────────────────────────────

interface JudgmentInput {
  naturalLanguageQuery: string;
  generatedSQL: string;
  results: any[];
  source?: string;
  executionTime?: number;
  sqlModel?: string;
}

interface TriggerInput {
  naturalLanguageQuery: string;
  sqlQuery: string;
  results: any[];
  source?: string;
  executionTime?: number;
}

// ── Replaces Express middleware triggerBackgroundJudgment ────────────────────

export function triggerBackgroundJudgment(input: TriggerInput): JudgmentInput | null {
  const { naturalLanguageQuery, sqlQuery, results, source, executionTime } = input;

  // Only judge if source is 'ai' and SQL was generated
  if (source === 'ai' && sqlQuery) {
    return {
      naturalLanguageQuery,
      generatedSQL: sqlQuery,
      results,
      resultsCount: results.length,
      source,
      executionTime,
      sqlModel: process.env.TEXT2SQL_MODEL,
      judgeModel: process.env.JUDGE_MODEL,
    };
  }

  return null;
}

// ── Count-based evaluation (unchanged) ──────────────────────────────────────

function evaluateByCountOnly(
  resultsCount: number,
  expectedCount: number | string
): { score: number; passed: boolean; explanation: string } {
  const meetsExpectations = checkResultsCount(resultsCount, expectedCount);

  if (meetsExpectations) {
    return {
      score: 5,
      passed: true,
      explanation: `Count OK: got ${resultsCount}, expected ${expectedCount}`,
    };
  }

  if (resultsCount === 0) {
    return {
      score: 1,
      passed: false,
      explanation: `No results, expected ${expectedCount}`,
    };
  }

  return {
    score: 3,
    passed: false,
    explanation: `Wrong count: got ${resultsCount}, expected ${expectedCount}`,
  };
}

// ── Main judgment execution (unchanged) ─────────────────────────────────────

export async function runBackgroundJudgment(data: JudgmentInput): Promise<void> {
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
      sqlModel,
    } = data;

    const resultsCount = results.length;

    // Find test case - exact match only
    const testCase = testSet.find(
      (t) =>
        t.naturalLanguageQuery.toLowerCase().trim() ===
        naturalLanguageQuery.toLowerCase().trim()
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
      judgeModel: process.env.JUDGE_MODEL,
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

    // PATH 2: No test case - LLM judge
    } else {
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