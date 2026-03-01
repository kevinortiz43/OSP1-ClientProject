import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { type Judgment } from '../types'
import { randomUUID } from 'crypto';
import { TABLE_NAMES, COLUMN_NAMES, CATEGORY_VALUES } from "../sql_db/schemas-helper"


/**
 * JUDGE SERVICE
 * 
 * A DEVELOPMENT TOOL designed for rapid prototyping, NOT production use.
 * 
 * Purpose:
 * - Enable rapid evaluation of text-to-SQL outputs during development and prompt engineering
 * - Provide immediate feedback on SQL generation quality using lightweight open-source judge models
 * - Support hybrid validation strategy:
 *   a) Match results count comparison when test set contains ground truth
 *   b) LLM-as-judge evaluation for ad-hoc queries without predefined expectations
 * - Mock the behavior of a production evaluation system for testing workflows
 * -Saves logs under aiTest/judgements folder 
 * 
 * Core Limitations:
 * - Result count comparison only validates row volume, not data correctness or quality
 *   (e.g., correct count but wrong records would pass validation)
 * - LLM-as-judge accuracy is bounded by the judge model's capabilities:
 *   * Smaller models may miss subtle semantic differences
 *   * No guaranteed consistency in evaluation criteria
 *   * Potential bias based on model training data
 * - Lacks calibration against human expert judgments
*/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define which columns belong to which table
const TABLE_COLUMNS = {
    allTrustControls: ['id', 'short', 'long', 'category', 'searchText', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
    allTrustFaqs: ['id', 'question', 'answer', 'category', 'searchText', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
    allTeams: ['id', 'firstName', 'lastName', 'role', 'email', 'isActive', 'employeeId', 'responseTimeHours', 'category', 'searchText', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy']
} as const;

export function checkResultsCount(actualCount: number, expectedCount: number | string): boolean {
    if (typeof expectedCount === 'number') return actualCount === expectedCount;

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
    return actualCount === parseInt(expectedCount, 10);
}

export class JudgeService {
    private readonly judgeModel: string;
    private readonly ollamaUrl: string;
    private readonly judgmentsDir: string;

    constructor() {
        this.judgeModel = process.env.JUDGE_MODEL || 'qwen2.5-coder:7b';
        this.ollamaUrl = process.env.MODEL_URL || 'http://ollama:11434/v1/chat/completions';
        this.judgmentsDir = path.join(__dirname, '..', 'aiTest', 'judgments');

        if (!fs.existsSync(this.judgmentsDir)) {
            fs.mkdirSync(this.judgmentsDir, { recursive: true });
        }
    }

    /**
     * Build schema context
     */
    private getSchemaContext(): string {
        const tableDefs = TABLE_NAMES.map(tableName => {
            const columns = TABLE_COLUMNS[tableName as keyof typeof TABLE_COLUMNS]
                .map(col => `"${col}"`)
                .join(', ');
            return `- "${tableName}": ${columns}`;
        }).join('\n');

        const categoryList = CATEGORY_VALUES.map(c => `'${c}'`).join(', ');

        const allColumns = COLUMN_NAMES.map(c => `"${c}"`).join(', ');

        return `DATABASE SCHEMA:

Tables:
${tableDefs}

All possible columns: ${allColumns}

Valid category values: ${categoryList}

CRITICAL RULES:
- Always double-quote table names: ${TABLE_NAMES.map(t => `"${t}"`).join(', ')}
- Always double-quote column names: "id", "firstName", etc.
- String literals use single quotes: 'value'
- Use ILIKE for case-insensitive searches
- Category values must match case exactly: ${CATEGORY_VALUES.slice(0, 3).join(', ')}...`;
    }

    /**
     * Clean LLM response by removing markdown formatting (human-readable)
     */
    private cleanLLMResponse(rawResponse: string): string {
        let cleaned = rawResponse.trim();

        // Remove markdown code blocks
        cleaned = cleaned.replace(/^```json\n/, '');
        cleaned = cleaned.replace(/^```\n/, '');
        cleaned = cleaned.replace(/\n```$/, '');
        cleaned = cleaned.replace(/^```$/, '');

        return cleaned;
    }

    /**
     * Parse LLM response to extract score and explanation
     */
    private parseLLMResponse(rawResponse: string): { score: number; explanation: string } | null {
        try {
            // Clean the response first
            const cleaned = this.cleanLLMResponse(rawResponse);

            // Remove any "Assistant:" or similar prefixes
            const withoutPrefix = cleaned.replace(/^(Assistant:|AI:|Model:|<|im_start|>:)\s*/i, '');

            // Try to parse as JSON
            const parsed = JSON.parse(withoutPrefix);

            // Validate we have the required fields
            if (typeof parsed.score === 'number' && typeof parsed.explanation === 'string') {
                // Clean up the explanation - remove extra whitespace and artifacts
                const cleanExplanation = parsed.explanation
                    .replace(/\|\|/g, '')                    // REMOVE || characters        
                    .replace(/\n\s*,?\s*\n/g, '\n')  // Remove lines with just commas
                    .replace(/\s+/g, ' ')            // Normalize whitespace
                    .trim();

                return {
                    score: Math.min(5, Math.max(1, parsed.score)),
                    explanation: cleanExplanation
                };
            }
        } catch (e) {
            // If JSON parsing fails, try to extract score from text
            const scoreMatch = rawResponse.match(/[1-5]/);
            if (scoreMatch) {
                // Extract explanation by removing score and cleaning
                let explanation = rawResponse
                    .replace(/\|\|/g, '') // remove separators ||
                    .replace(/```json|```/g, '')
                    .replace(/[{}"]/g, '')
                    .replace(/score:\s*\d+/i, '')
                    .replace(/explanation:/i, '')
                    .replace(/Assistant:|AI:|Model:|<|im_start|>:/gi, '')  // Remove prefixes
                    .replace(/\n\s*,?\s*\n/g, ' ')           // Clean up newlines with commas
                    .replace(/\s+/g, ' ')                    // Normalize spaces
                    .trim();

                return {
                    score: parseInt(scoreMatch[0], 10),
                    explanation: explanation.substring(0, 500)
                };
            }
        }
        return null;
    }

    async evaluateWithLLM(
        userPrompt: string,
        generatedSQL: string,
        results: any[]
    ): Promise<{ score: number; explanation: string }> {

        // Build dynamic guidance based on results
        let resultsGuidance = '';
        if (results.length === 0) {
            resultsGuidance = `Note: Query returned 0 rows. This could be correct (e.g., "show inactive users" with none) or incorrect. Judge the SQL logic, not just the count.`;
        }

        const prompt = `You are a judge evaluating SQL queries. Score generated SQL query and give reasons for your evaluation.

${this.getSchemaContext()}

USER QUESTION: "${userPrompt}"

GENERATED SQL:
${generatedSQL}

RESULTS: ${results.length} rows
${results.length > 0 ? `First 3 rows: ${JSON.stringify(results.slice(0, 3), null, 2)}` : '(empty)'}

${resultsGuidance}

SCORING (1-5):
5 = Perfect - SQL correctly answers question
4 = Good - Minor issues (extra columns, wrong order)
3 = OK - Correct tables but wrong conditions
2 = Poor - Wrong tables or completely wrong logic
1 = Wrong - Syntax errors, invalid tables/columns

IMPORTANT: Return ONLY a valid JSON object. NO markdown, NO code blocks, NO extra text, NO separators.
{
  "score": number,
  "explanation": "brief reason"
}`;

        try {
            console.log(`Calling judge model at ${this.ollamaUrl} with model ${this.judgeModel}`);

            const response = await fetch(this.ollamaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.judgeModel,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a judge that evaluates SQL queries. Always respond with valid JSON only.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.1,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Judge API error (${response.status}):`, errorText);
                throw new Error(`HTTP error ${response.status}`);
            }

            const data = await response.json();

            // Check if we have the expected structure
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.error('Unexpected API response structure:', JSON.stringify(data).substring(0, 200));
                return {
                    score: 3,
                    explanation: 'Unexpected API response format'
                };
            }

            const llmResponse = data.choices[0].message.content;
            console.log('Raw judge response:', llmResponse);

            // If response is empty, try one more time with a simpler prompt
            if (!llmResponse || llmResponse.trim() === '') {
                console.log('Empty response received, retrying with simplified prompt...');

                // Retry with a much simpler prompt
                const simplePrompt = `Score this SQL (1-5) and explain briefly in JSON: 
SQL: ${generatedSQL}
User: ${userPrompt}
Return: {"score": number, "explanation": "reason"}`;

                const retryResponse = await fetch(this.ollamaUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.judgeModel,
                        messages: [{ role: 'user', content: simplePrompt }],
                        temperature: 0.1,
                        max_tokens: 300
                    })
                });

                const retryData = await retryResponse.json();
                const retryContent = retryData.choices?.[0]?.message?.content;
                if (retryContent) {
                    const parsed = this.parseLLMResponse(retryContent);
                    if (parsed) return parsed;
                }
            }

            // Parse the LLM response
            const parsed = this.parseLLMResponse(llmResponse);

            if (parsed) {
                return {
                    score: parsed.score,
                    explanation: parsed.explanation
                };
            }

            // Fallback if parsing fails
            console.warn('Could not parse judge response, using fallback');
            return {
                score: 3,
                explanation: 'Could not parse LLM response'
            };

        } catch (error) {
            console.error('LLM evaluation failed:', error);
            return {
                score: 3,
                explanation: `Evaluation error: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    async saveJudgment(judgment: Judgment): Promise<string> {
        const id = randomUUID();
        const date = new Date();

        // Get all existing judgment files for today
        const files = fs.readdirSync(this.judgmentsDir)
            .filter(f => f.endsWith('.json'));

        // Create date prefix: YYYYMMDD
        const datePrefix = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

        // Find the highest counter for today
        let maxCounter = 0;
        const todayFiles = files.filter(f => f.startsWith(datePrefix));

        if (todayFiles.length > 0) {
            // Extract counter numbers from existing files
            // Format: YYYYMMDD_001_uuid.json
            const counters = todayFiles.map(f => {
                const match = f.match(/^\d{8}_(\d{3})_/);
                return match ? parseInt(match[1], 10) : 0;
            });
            maxCounter = Math.max(...counters, 0);
        }

        // Increment counter and pad to 3 digits
        const counter = String(maxCounter + 1).padStart(3, '0');

        // Create filename: YYYYMMDD_001_last4uuid.json
        const filename = `${datePrefix}_${counter}_${id.slice(-4)}.json`;
        const filepath = path.join(this.judgmentsDir, filename);

        await fs.promises.writeFile(
            filepath,
            JSON.stringify({ id, ...judgment }, null, 2)
        );

        console.log(`Judgment saved: ${filename}`);
        return filepath;
    }
}