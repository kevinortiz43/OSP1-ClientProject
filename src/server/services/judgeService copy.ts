import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { type Judgment } from '../types'
import { generateSchemaDescription } from '../sql_db/schemas-helper';
import { randomUUID } from 'crypto';
import { normalizeSQL } from '../controller/backgroundJobs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Judge Service: Evaluates SQL generation quality through multiple methods.
 * 
 * This service provides both rule-based and LLM-based evaluation to assess
 * how well generated SQL answers user questions. The dual approach gives us:
 * 1. Fast, deterministic checks for known test cases
 * 2. Intelligent, flexible evaluation for novel queries
 * 
 * All judgments are persisted for tracking model improvement over time.
 */

/**
 * check resultsCount to make sure generatedSQL db query returns correct number
 */
export function checkResultsCount(actualCount: number, expectedCount: number | string): boolean {
    if (typeof expectedCount === 'number') {
        return actualCount === expectedCount;
    }
    const match = expectedCount.match(/^([<>]=?)(\d+)$/);
    if (match) {
        const operator = match[1];
        const value = parseInt(match[2], 10);
        switch (operator) {
            case '>=': return actualCount >= value;
            case '<=': return actualCount <= value;
            case '>': return actualCount > value;
            case '<': return actualCount < value;
            default: return false;
        }
    }
    return actualCount === parseInt(expectedCount as string, 10);
}

export class JudgeService {
    private readonly judgeModel: string;
    private readonly ollamaUrl: string;
    private readonly judgmentsDir: string;

    constructor() {
        // Use environment variables with sensible defaults
        this.judgeModel = process.env.JUDGE_MODEL || 'qwen2.5-coder:14b';
        this.ollamaUrl = process.env.TEXT2SQL_URL || 'http://ollama:11434';
        
        // Store judgments in a dedicated directory for easy access and analysis
        this.judgmentsDir = path.join(__dirname, '..', 'aiTest', 'judgments');

        console.log(`[DEBUG] __dirname: ${__dirname}`);
        console.log(`[DEBUG] Resolved judgmentsDir: ${this.judgmentsDir}`);
        console.log(`[DEBUG] Does judgmentsDir exist? ${fs.existsSync(this.judgmentsDir)}`);

        this.ensureJudgmentsDir();

        console.log(`JudgeService initialized with model: ${this.judgeModel}`);
        console.log(`Judgments will be saved to: ${this.judgmentsDir}`);
    }

    /**
     * Creates the judgments directory if it doesn't exist.
     * Prevents file write errors when saving judgments.
     */
    private ensureJudgmentsDir(): void {
        if (!fs.existsSync(this.judgmentsDir)) {
            fs.mkdirSync(this.judgmentsDir, { recursive: true });
            console.log(`Created judgments directory: ${this.judgmentsDir}`);
        }
    }

    /**
     * Compares generated SQL against expected SQL at multiple levels.
     * 
     * WHY: Exact string matching is too strict (different formatting, aliases).
     * Normalized matching ignores superficial differences while preserving meaning.
     * This gives us two signals:
     * - exactMatch: Did the model produce identical output? (rare but ideal)
     * - normalizedMatch: Is the logical structure correct? (good enough)
     */
    compareWithExpected(generatedSQL: string, expectedSQL: string): {
        exactMatch: boolean;
        normalizedMatch: boolean;
    } {
        return {
            exactMatch: generatedSQL === expectedSQL,
            normalizedMatch: normalizeSQL(generatedSQL) === normalizeSQL(expectedSQL)
        };
    }

    /**
     * Checks if actual result count meets expected criteria.
     * 
     * WHY: Expected counts can be specified in multiple ways:
     * - Exact number: "5" means exactly 5 rows
     * - Range/comparison: ">=10" means at least 10 rows
     * - Simple number string: "5-10" (extracted in backgroundJobs)
     * 
     * This flexibility allows test cases to specify acceptable result ranges
     * rather than brittle exact matches.
     */
    checkResultsCount(actualCount: number, expectedCount: number | string): boolean {
        // Delegate to the standalone exported function
        return checkResultsCount(actualCount, expectedCount);
    }

    /**
     * Performs basic validation to catch obvious SQL errors.
     * 
     * WHY: Before spending time on LLM evaluation, quickly reject SQL that
     * clearly won't execute. This saves API calls and provides faster feedback.
     * 
     * This is intentionally minimal - we don't want to over-validate and reject
     * creative but valid SQL structures.
     */
    private minimalSQLValidation(sql: string): { 
        valid: boolean; 
        error?: string 
    } {
        if (!sql || sql.trim() === '') {
            return { valid: false, error: 'SQL is empty' };
        }

        const sqlUpper = sql.toUpperCase();
        
        // Must have basic SELECT/FROM structure
        if (!sqlUpper.includes('SELECT') || !sqlUpper.includes('FROM')) {
            return { valid: false, error: 'SQL must contain SELECT and FROM clauses' };
        }

        // Count clauses - warn but don't reject on multiple SELECTs (could be subqueries)
        const selectCount = (sqlUpper.match(/SELECT/g) || []).length;
        const fromCount = (sqlUpper.match(/FROM/g) || []).length;
        
        if (selectCount > 1) {
            console.warn('Warning: Multiple SELECT clauses detected - verify this is intentional');
        }
        
        // Multiple FROM without UNION suggests invalid syntax
        if (fromCount > 1 && !sqlUpper.includes('UNION')) {
            return { valid: false, error: 'Multiple FROM clauses require UNION' };
        }

        return { valid: true };
    }

    /**
     * Normalizes scores to a consistent 1-5 scale with 0.5 increments.
     * 
     * WHY: Different scoring methods might produce different ranges.
     * This ensures all judgments use the same scale for comparison.
     * 
     * Rounding to 0.5 prevents false precision while maintaining enough
     * granularity to distinguish between different quality levels.
     */
    public normalizeScore(rawScore: number): number {
        const clampedScore = Math.min(5, Math.max(1, rawScore));
        return Math.round(clampedScore * 2) / 2;
    }

    /**
     * ============================================================================
     * PATH B: LLM-Based Evaluation (for ad-hoc queries without test cases)
     * ============================================================================
     * 
     * WHY THIS APPROACH:
     * When we don't have an expected SQL to compare against, we need a way to
     * evaluate if the generated SQL actually answers the user's question.
     * 
     * RATIONALE:
     * - LLMs understand natural language and can assess intent alignment
     * - They can examine results and determine if they answer the question
     * - They provide explanations, making the evaluation interpretable
     * - More flexible than rule-based systems for novel queries
     * 
     * PROCESS:
     * 1. Quick validation to catch obvious errors
     * 2. Provide LLM with schema, question, generated SQL, and sample results
     * 3. Ask for score (1-5) with explanation
     * 4. Parse response, handle both JSON and text formats
     * 5. Normalize score for consistency
     * 
     * GUIDELINES emphasize intent over syntax because:
     * - Multiple SQL formulations can answer the same question
     * - Aliases and formatting don't affect correctness
     * - Results are the ultimate truth
     */
    async evaluateWithLLM(
        userPrompt: string,
        generatedSQL: string,
        results: any[]
    ): Promise<{ score: number; explanation: string }> {
        
        // Fast path: reject obviously invalid SQL before calling LLM
        const validation = this.minimalSQLValidation(generatedSQL);
        if (!validation.valid) {
            return {
                score: 1,
                explanation: `SQL validation failed: ${validation.error}`
            };
        }

        const schemaDescription = generateSchemaDescription();
        
        const prompt = `You are a SQL expert judge. Evaluate if this SQL correctly answers the user's question.

DATABASE SCHEMA:
${schemaDescription}

USER QUESTION: "${userPrompt}"

GENERATED SQL: 
\`\`\`sql
${generatedSQL}
\`\`\`

RESULTS RETURNED (first 3 rows):
${JSON.stringify(results.slice(0, 3), null, 2)}

CRITICAL EVALUATION GUIDELINES:
1. INTENT over syntax - Focus on whether the SQL answers the question, not cosmetic differences
2. "ALL" means ALL columns - If user asks for "all" or "list all", they expect all columns (SELECT *)
3. Column selection matters - If user asks for specific columns, verify they're selected
4. Results count is important - Verify the query returns what was requested
5. Ignore alias names - "COUNT(*) as count" vs "COUNT(*) as control_count" are functionally identical

SCORING GUIDE (be strict - 5 is rare):
5 = PERFECT - Exactly answers the question with correct syntax and relevant results
4 = GOOD - Minor issues but still essentially correct (e.g., different alias name)
3 = ACCEPTABLE - Answers partially but has noticeable issues
2 = POOR - Doesn't answer correctly, significant problems
1 = WRONG - Completely incorrect or wouldn't execute

Return ONLY a JSON object with:
{
  "score": (number between 1-5),
  "explanation": (string explaining the score, focusing on whether the query answers the question)
}`;

        try {
            const response = await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.judgeModel,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.1, // Low temperature for consistent evaluation
                        num_predict: 2000, // Enough for detailed explanation
                    }
                })
            });

            const data = await response.json();

            // Try to parse as JSON first (preferred format)
            try {
                const result = JSON.parse(data.response);
                const normalizedScore = this.normalizeScore(result.score || 3);
                return {
                    score: normalizedScore,
                    explanation: result.explanation || 'No explanation provided'
                };
            } catch (e) {
                // Fallback: extract score from text response
                // Some models might not follow JSON format instructions
                const scoreMatch = data.response.match(/[1-5]/);
                const rawScore = scoreMatch ? parseInt(scoreMatch[0], 10) : 3;
                const normalizedScore = this.normalizeScore(rawScore);
                return {
                    score: normalizedScore,
                    explanation: data.response.trim()
                };
            }
        } catch (error) {
            console.error('Judge evaluation failed:', error);
            return {
                score: 0,
                explanation: 'Evaluation failed due to error'
            };
        }
    }

    /**
     * Saves judgment to file system with a descriptive filename.
     * 
     * WHY: Persistent storage allows:
     * - Tracking model performance over time
     * - Building a dataset for fine-tuning
     * - Debugging failed queries
     * - Comparing different models/approaches
     * 
     * Filename format: YYYYMMDD-HHMMSS_last4uuid_keywords.json
     * This makes files sortable by date and searchable by content.
     */
    async saveJudgment(judgment: Judgment): Promise<string> {
        const judgmentWithId = {
            id: randomUUID(),
            ...judgment,
            timestamp: judgment.timestamp instanceof Date
                ? judgment.timestamp
                : new Date(judgment.timestamp)
        };

        const date = judgmentWithId.timestamp;
        const shortTimestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;

        const shortId = judgmentWithId.id.slice(-4);

        // Create a readable slug from the query for easy identification
        const querySlug = judgment.naturalLanguageQuery
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .split('-')
            .filter(word => !['what', 'who', 'where', 'when', 'why', 'how', 'the', 'and', 'for', 'are', 'is', 'tell', 'about'].includes(word))
            .slice(0, 3)
            .join('-')
            .substring(0, 20);

        const filename = `${shortTimestamp}_${shortId}_${querySlug}.json`;
        const filepath = path.join(this.judgmentsDir, filename);

        await fs.promises.writeFile(
            filepath,
            JSON.stringify(judgmentWithId, null, 2),
            'utf-8'
        );

        console.log(`Judgment saved: ${filename}`);
        return filepath;
    }

    /**
     * Retrieves a specific judgment by its ID.
     * 
     * WHY: For debugging and detailed analysis of specific queries.
     * Searches by partial ID match since filename includes only last 4 chars.
     */
    async getJudgmentById(id: string): Promise<any | null> {
        try {
            const files = await fs.promises.readdir(this.judgmentsDir);
            const matchingFile = files.find(file =>
                file.includes(`_${id}_`)
            );

            if (!matchingFile) {
                console.log(`No judgment found with ID: ${id}`);
                return null;
            }

            const filepath = path.join(this.judgmentsDir, matchingFile);
            const content = await fs.promises.readFile(filepath, 'utf-8');
            return JSON.parse(content);

        } catch (error) {
            console.error(`Failed to read judgment: ${error.message}`);
            return null;
        }
    }

    /**
     * Returns all judgments sorted by timestamp (newest first).
     * 
     * WHY: For dashboards, trend analysis, and model comparison.
     * Sorting ensures most recent evaluations are shown first.
     */
    async getAllJudgments(): Promise<Judgment[]> {
        try {
            const files = await fs.promises.readdir(this.judgmentsDir);
            const judgments: Judgment[] = [];

            for (const file of files) {
                if (!file.endsWith('.json')) continue;

                const filepath = path.join(this.judgmentsDir, file);
                const content = await fs.promises.readFile(filepath, 'utf-8');

                try {
                    const judgment = JSON.parse(content);
                    judgment.timestamp = new Date(judgment.timestamp);
                    judgments.push(judgment);
                } catch (e) {
                    console.warn(`Skipping invalid JSON: ${file}`);
                }
            }

            return judgments.sort((a, b) =>
                b.timestamp.getTime() - a.timestamp.getTime()
            );

        } catch (error) {
            console.error('Failed to read judgments directory:', error);
            return [];
        }
    }
}