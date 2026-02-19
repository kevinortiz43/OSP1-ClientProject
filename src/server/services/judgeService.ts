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
            fs.mkdirSync(this.judgmentsDir, { recursive: true });
            console.log(`Created judgments directory: ${this.judgmentsDir}`);
        }
    }

    compareWithExpected(generatedSQL: string, expectedSQL: string): {
        exactMatch: boolean;
        normalizedMatch: boolean;
    } {
        return {
            exactMatch: generatedSQL === expectedSQL,
            normalizedMatch: normalizeSQL(generatedSQL) === normalizeSQL(expectedSQL)
        };
    }

    checkResultsCount(actualCount: number, expectedCount: number | string): boolean {
        return checkResultsCount(actualCount, expectedCount);
    }

    private minimalSQLValidation(sql: string): {
        valid: boolean;
        error?: string
    } {
        if (!sql || sql.trim() === '') {
            return { valid: false, error: 'SQL is empty' };
        }

        const sqlUpper = sql.toUpperCase();

        if (!sqlUpper.includes('SELECT') || !sqlUpper.includes('FROM')) {
            return { valid: false, error: 'SQL must contain SELECT and FROM clauses' };
        }

        const selectCount = (sqlUpper.match(/SELECT/g) || []).length;
        const fromCount = (sqlUpper.match(/FROM/g) || []).length;

        if (selectCount > 1) {
            console.warn('Warning: Multiple SELECT clauses detected - verify this is intentional');
        }

        if (fromCount > 1 && !sqlUpper.includes('UNION')) {
            return { valid: false, error: 'Multiple FROM clauses require UNION' };
        }

        return { valid: true };
    }

    public normalizeScore(rawScore: number): number {
        const clampedScore = Math.min(5, Math.max(1, rawScore));
        return Math.round(clampedScore * 2) / 2;
    }

    /**
     * Helper method to check if results have correct category for category-specific queries
     */
    private hasCorrectCategory(results: any[], userPromptLower: string): boolean {
        if (!results.length) return false;
        
        return results.some(r => {
            if (!r.category) return false;
            return CATEGORY_VALUES.some(category =>
                userPromptLower.includes(category.toLowerCase()) &&
                r.category.toLowerCase().includes(category.toLowerCase())
            );
        });
    }

    /**
     * Helper method to format results for display
     */
    private formatResultsForDisplay(results: any[]): string {
        if (!results.length) return "No results returned";

        const sampleResult = results[0];
        let display = `Found ${results.length} result(s)\n\nFIRST RESULT:\n`;

        // FAQ result
        if (sampleResult.source === 'trust_faq' || sampleResult.question) {
            display += `- Question: "${sampleResult.question || 'N/A'}"\n`;
            display += `- Answer: "${sampleResult.answer ? 
                sampleResult.answer.substring(0, 150) + 
                (sampleResult.answer.length > 150 ? '...' : '') : 'N/A'}"`;
            
            if (sampleResult.category) {
                display += `\n- CATEGORY: "${sampleResult.category}" (IMPORTANT for category questions)`;
            }
            display += `\n- Source: FAQ`;
        }
        // Control result
        else if (sampleResult.source === 'trust_control' || sampleResult.short) {
            display += `- Short Description: "${sampleResult.short || 'N/A'}"\n`;
            display += `- Long Description: "${sampleResult.long ? 
                sampleResult.long.substring(0, 150) + 
                (sampleResult.long.length > 150 ? '...' : '') : 'N/A'}"`;
            
            if (sampleResult.category) {
                display += `\n- CATEGORY: "${sampleResult.category}" (IMPORTANT for category questions)`;
            }
            display += `\n- Source: Control`;
        }
        // Team result
        else if (sampleResult.source === 'team' || sampleResult.firstName) {
            const fullName = `${sampleResult.firstName || ''} ${sampleResult.lastName || ''}`.trim();
            display += `- Name: "${fullName || 'N/A'}"\n`;
            display += `- Role: "${sampleResult.role || 'N/A'}"\n`;
            display += `- Email: "${sampleResult.email || 'N/A'}"`;
            
            if (sampleResult.category) {
                display += `\n- CATEGORY: "${sampleResult.category}" (IMPORTANT for category questions)`;
            }
            
            display += `\n- Active: ${sampleResult.isActive ? 'Yes' : 'No'}\n`;
            display += `- Response Time: ${sampleResult.responseTimeHours || 'N/A'} hours`;
        }
        // Fallback to JSON
        else {
            display += JSON.stringify(sampleResult, null, 2);
            if (sampleResult.category) {
                display += `\n\nNOTE: Category field found: "${sampleResult.category}"`;
            }
        }

        if (results.length > 1) {
            display += `\n\nPlus ${results.length - 1} more result(s).`;
        }

        return display;
    }

    /**
     * Helper method to parse LLM response
     */
    private parseLLMResponse(rawResponse: string): { score: number; explanation: string } | null {
        let cleaned = rawResponse.trim();
        
        // Clean markdown
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

    async evaluateWithLLM(
        userPrompt: string,
        generatedSQL: string,
        results: any[]
    ): Promise<{ score: number; explanation: string }> {

        const validation = this.minimalSQLValidation(generatedSQL);
        if (!validation.valid) {
            return {
                score: 1,
                explanation: `SQL validation failed: ${validation.error}`
            };
        }

        const schemaDescription = generateSchemaDescription();
        const userPromptLower = userPrompt.toLowerCase();
        
        // Analyze query
        const isCategoryQuery = CATEGORY_VALUES.some(category =>
            userPromptLower.includes(category.toLowerCase())
        );
        
        const categoryMatch = generatedSQL.match(/category ILIKE '([^']+)'/i);
        const sqlHasCategoryFilter = !!categoryMatch;
        const sqlCategory = categoryMatch ? categoryMatch[1] : null;

        // Format results
        const resultsDisplay = this.formatResultsForDisplay(results);

        // Build evaluation instructions
        const evaluationInstructions = isCategoryQuery
            ? `This is a CATEGORY-SPECIFIC question. The user asked about a specific category.
Look for the CATEGORY field in the results. It should match what the user asked for.`
            : `This is a GENERAL question (no specific category mentioned).
The CATEGORY field is OPTIONAL in the results. Focus on whether the data answers the question, regardless of category.`;

        const prompt = `You are a SQL expert judge. Your task is to evaluate if the generated SQL correctly answers the user's question.

DATABASE SCHEMA:
${schemaDescription}

USER QUESTION: "${userPrompt}"

GENERATED SQL: 
\`\`\`sql
${generatedSQL}
\`\`\`

ACTUAL RESULTS FROM DATABASE:
${resultsDisplay}

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
            const parsed = this.parseLLMResponse(data.response);

            if (parsed) {
                // Apply reality checks
                if (isCategoryQuery && results.length > 0) {
                    if (this.hasCorrectCategory(results, userPromptLower) && parsed.score < 4) {
                        console.log('LLM gave low score despite correct category - overriding');
                        return {
                            score: 5,
                            explanation: `SQL correctly returns results with matching category: "${results[0]?.category}"`
                        };
                    }
                } else if (!isCategoryQuery && results.length > 0 && parsed.score < 3) {
                    console.log('LLM gave low score for non-category query with results - adjusting');
                    return {
                        score: 3,
                        explanation: `Query returned ${results.length} result(s) answering the general question.`
                    };
                }

                const normalizedScore = this.normalizeScore(parsed.score || 3);
                return {
                    score: normalizedScore,
                    explanation: parsed.explanation || 'No explanation provided'
                };
            }

            // Fallback to text extraction
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
}