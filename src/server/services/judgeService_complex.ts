import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { type Judgment } from '../types'
import { generateSchemaDescription, CATEGORY_VALUES } from '../sql_db/schemas-helper';
import { randomUUID } from 'crypto';
import { normalizeSQL } from '../controller/backgroundJobs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * JUDGE SERVICE 
 * 
 * A DEVELOPMENT TOOL designed for rapid prototyping of open source lightweight models, NOT production use.
 * 
 * Evaluates SQL generation quality through multiple methods
 * 
 * This service provides both rule-based and LLM-based evaluation to assess
 * how well generated SQL answers user questions. The dual approach gives us:
 * 1. Fast, deterministic checks for known test cases
 * 2. Intelligent, flexible evaluation for novel queries
 * 
 * All judgments are persisted for tracking model improvement over time.
 */

/**
 * Check if actual result count meets expected criteria.
 * Expected count can be: exact number, comparison (>=5), or simple number string
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
// returns boolean
    return actualCount === parseInt(expectedCount as string, 10);
}


export class JudgeService {
    private readonly judgeModel: string;
    private readonly ollamaUrl: string;
    private readonly judgmentsDir: string;

    constructor() {
        this.judgeModel = process.env.JUDGE_MODEL || 'qwen2.5-coder:14b';
        this.ollamaUrl = process.env.TEXT2SQL_URL || 'http://ollama:11434';
        this.judgmentsDir = path.join(__dirname, '..', 'aiTest', 'judgments'); 

        console.log(`JudgeService initialized with model: ${this.judgeModel}`);
        console.log(`Judgments will be saved to: ${this.judgmentsDir}`);

        this.ensureJudgmentsDir();
    }

    private ensureJudgmentsDir(): void {
        if (!fs.existsSync(this.judgmentsDir)) {
            fs.mkdirSync(this.judgmentsDir, { recursive: true }); // recursive: true creates parent directories if needed
            console.log(`Created judgments directory: ${this.judgmentsDir}`);
        }
    }

    /**
        * Compares generated SQL against expected SQL at multiple levels.
        * exactMatch: Strict string comparison (rarely matches due to formatting)
        * normalizedMatch: Compares after removing aliases, standardizing quotes, etc.
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
     * Delegates to the standalone function (allows both class and direct usage)
     */
    checkResultsCount(actualCount: number, expectedCount: number | string): boolean {
        return checkResultsCount(actualCount, expectedCount);
    }
    /**
     * Quick validation to catch obvious SQL errors before LLM evaluation.
     * Saves time and API calls by rejecting invalid SQL early.
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

        // Count occurrences of SELECT and FROM
        const selectCount = (sqlUpper.match(/SELECT/g) || []).length;
        const fromCount = (sqlUpper.match(/FROM/g) || []).length;

        // Multiple SELECTs might be subqueries - warn but don't reject
        if (selectCount > 1) {
            console.warn('Warning: Multiple SELECT clauses detected - verify this is intentional');
        }

        // Multiple FROM without UNION is invalid syntax
        // Example: "SELECT * FROM table1, table2" should use UNION or JOIN
        if (fromCount > 1 && !sqlUpper.includes('UNION')) {
            return { valid: false, error: 'Multiple FROM clauses require UNION' };
        }

        return { valid: true };
    }

    /**
     * Normalizes scores to consistent 1-5 scale with 0.5 increments.
     * Example: rawScore 4.7 → clamped to 5 → rounded to 5
     * Example: rawScore 3.2 → clamped to 3.2 → rounded to 3.0
     */
    public normalizeScore(rawScore: number): number {
        const clampedScore = Math.min(5, Math.max(1, rawScore));  // Clamp between 1 and 5
        return Math.round(clampedScore * 2) / 2; // Round to nearest 0.5
    }

    /**
     * Helper method to check if results have correct category for category-specific queries
     */
    private hasCorrectCategory(results: any[], userPromptLower: string): boolean {
        if (!results.length) return false;

        // Check if any result has a category that matches what the user asked for     
        return results.some(r => {
            if (!r.category) return false;
            // Compare user's query against known categories and result's category
            return CATEGORY_VALUES.some(category =>
                userPromptLower.includes(category.toLowerCase()) &&
                r.category.toLowerCase().includes(category.toLowerCase())
            );
        });
    }

    /**
     * Helper method to parse LLM response
     * Handles both JSON and markdown-wrapped JSON responses
     */
    private parseLLMResponse(rawResponse: string): { score: number; explanation: string } | null {
        let cleaned = rawResponse.trim();

        // Remove markdown code blocks if present
        // Example: ```json\n{"score":5}\n``` → {"score":5}
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json\n/, '').replace(/\n```$/, '');
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```\n/, '').replace(/\n```$/, '');
        }

        try {
            return JSON.parse(cleaned);
        } catch {
            return null;
        }
    }

    /**
     * Main LLM evaluation method
     * Steps:
     * 1. Validate SQL syntax
     * 2. Get schema description
     * 3. Analyze if query is category-specific
     * 4. stringify results
     * 5. Build instructions for LLM
     * 6. Construct full prompt for LLM
     * 7. Call LLM API
     * 8. Parse response and apply reality checks
     * 9. Return normalized score and explanation
     * 10. fallback in invalid JSON
     */
    async evaluateWithLLM(
        userPrompt: string,
        generatedSQL: string,
        results: any[]
    ): Promise<{ score: number; explanation: string }> {

        // Step 1: Quick validation
        const validation = this.minimalSQLValidation(generatedSQL);
        if (!validation.valid) {
            return {
                score: 1,
                explanation: `SQL validation failed: ${validation.error}`
            };
        }
        // Step 2: Get schema for context
        const schemaDescription = generateSchemaDescription();
        const userPromptLower = userPrompt.toLowerCase();

        // Step 3: Analyze query characteristics
        // Check if user asked about a specific category
        const isCategoryQuery = CATEGORY_VALUES.some(category =>
            userPromptLower.includes(category.toLowerCase())
        );

        const categoryMatch = generatedSQL.match(/category ILIKE '([^']+)'/i);
        const sqlHasCategoryFilter = !!categoryMatch;
        const sqlCategory = categoryMatch ? categoryMatch[1] : null;

        // Step 4: Just stringify the results 
        const resultsJSON = JSON.stringify(results.slice(0, 3), null, 2);

        // Step 5: Build evaluation instructions based on query type
        const evaluationInstructions = isCategoryQuery
            ? `This is a CATEGORY-SPECIFIC question. The user asked about a specific category.
Look for the CATEGORY field in the results. It should match what the user asked for.`
            : `This is a GENERAL question (no specific category mentioned).
The CATEGORY field is OPTIONAL in the results. Focus on whether the data answers the question, regardless of category.`;

        // Step 6: Construct the full prompt for LLM
        const prompt = `You are a SQL expert judge. Your task is to evaluate if the generated SQL correctly answers the user's question.

DATABASE SCHEMA:
${schemaDescription}

USER QUESTION: "${userPrompt}"

GENERATED SQL: 
\`\`\`sql
${generatedSQL}
\`\`\`

RESULTS (first 3 rows as JSON):
${resultsJSON}

QUERY ANALYSIS:
- Is this a category-specific question? ${isCategoryQuery ? 'YES' : 'NO'}
- Does the SQL filter by category? ${sqlHasCategoryFilter ? `YES (category: ${sqlCategory})` : 'NO'}
- Results returned: ${results.length} row(s)

EVALUATION INSTRUCTIONS:
${evaluationInstructions}

SCORING RUBRIC:
5 = PERFECT - Results exactly match what was asked
4 = GOOD - Results are correct but maybe missing non-critical fields
3 = ACCEPTABLE - Results partially match but have minor issues
2 = POOR - Results don't match what was asked
1 = WRONG - Query failed or returned completely unrelated data

Return ONLY a JSON object with:
{
  "score": (number between 1-5),
  "explanation": (string explaining the score)
}`;
        // Step 7: Call Ollama API
        try {
            const response = await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.judgeModel,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.1,
                        num_predict: 2000,
                    }
                })
            });

            const data = await response.json();

            // Step 8: Parse LLM response
            const parsed = this.parseLLMResponse(data.response);

            if (parsed) {
                // Step 9: Apply reality checks to catch LLM hallucinations

                // Case A: Category query with correct results but LLM gave low score

                if (isCategoryQuery && results.length > 0) {
                    if (this.hasCorrectCategory(results, userPromptLower) && parsed.score < 4) {
                        console.log('LLM gave low score despite correct category - overriding');
                        return {
                            score: 5,
                            explanation: `SQL correctly returns results with matching category: "${results[0]?.category}"`
                        };
                    }

                    // Case B: Non-category query with results but LLM gave low score  
                } else if (!isCategoryQuery && results.length > 0 && parsed.score < 3) {
                    console.log('LLM gave low score for non-category query with results - adjusting');
                    return {
                        score: 3,
                        explanation: `Query returned ${results.length} result(s) answering the general question.`
                    };
                }
                // Normal case: Use LLM's score
                const normalizedScore = this.normalizeScore(parsed.score || 3);
                return {
                    score: normalizedScore,
                    explanation: parsed.explanation || 'No explanation provided'
                };
            }

            // Step 10: Fallback if response isn't valid JSON
            // Extract just the number from text response
            const scoreMatch = data.response.match(/[1-5]/);
            const rawScore = scoreMatch ? parseInt(scoreMatch[0], 10) : 3;

            // Apply same reality checks to fallback
            if (isCategoryQuery && results.length > 0) {
                if (this.hasCorrectCategory(results, userPromptLower) && rawScore < 4) {
                    return {
                        score: 5,
                        explanation: `SQL correctly returns results with matching category: "${results[0]?.category}"`
                    };
                }
            } else if (!isCategoryQuery && results.length > 0 && rawScore < 3) {
                return {
                    score: 3,
                    explanation: `Query returned ${results.length} result(s) answering the general question.`
                };
            }

            const normalizedScore = this.normalizeScore(rawScore);
            return {
                score: normalizedScore,
                explanation: data.response.trim()
            };

        } catch (error) {
            console.error('Judge evaluation failed:', error);
            return {
                score: 0,
                explanation: 'Evaluation failed due to error'
            };
        }
    }
    /**
     * Saves judgment to file system with descriptive filename
     * Filename format: YYYYMMDD-HHMMSS_last4uuid_keywords.json
     * Example: 20260219-143022_3f7a_cloud-security.json
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

        // Create timestamp part: YYYYMMDD-HHMMSS
        const shortTimestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;

        // Get last 4 chars of UUID for uniqueness
        const shortId = judgmentWithId.id.slice(-4);

        // Create readable slug from query
        const querySlug = judgment.naturalLanguageQuery
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
            .split('-')
            .filter(word => !['what', 'who', 'where', 'when', 'why', 'how', 'the', 'and', 'for', 'are', 'is', 'tell', 'about'].includes(word)) // remove non-meaningful words
            .slice(0, 3) // Take first 3 meaningful words
            .join('-')
            .substring(0, 20);  // Limit length

        const filename = `${shortTimestamp}_${shortId}_${querySlug}.json`;
        const filepath = path.join(this.judgmentsDir, filename);

        // Write file asynchronously
        await fs.promises.writeFile(
            filepath,
            JSON.stringify(judgmentWithId, null, 2),
            'utf-8'
        );

        console.log(`Judgment saved: ${filename}`);
        return filepath;
    }
}