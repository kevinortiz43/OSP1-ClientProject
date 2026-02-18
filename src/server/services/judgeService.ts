import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { type Judgment } from '../types'
import { generateSchemaDescription } from '../sql_db/schemas-helper';
import { randomUUID } from 'crypto';

// set up paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export class JudgeService {
    private readonly judgeModel: string;
    private readonly ollamaUrl: string;
    private readonly judgmentsDir: string;

    constructor() {
        this.judgeModel = process.env.JUDGE_MODEL || 'phi4-reasoning';
        this.ollamaUrl = process.env.TEXT2SQL_URL || 'http://ollama:11434';

        // OS-agnostic path (see defined __dirname above)
        this.judgmentsDir = path.join(__dirname, '..', 'aiTest', 'judgments');

        // DEBUG: Log the resolved path
        console.log(`[DEBUG] __dirname: ${__dirname}`);
        console.log(`[DEBUG] Resolved judgmentsDir: ${this.judgmentsDir}`);
        console.log(`[DEBUG] Does judgmentsDir exist? ${fs.existsSync(this.judgmentsDir)}`);

        this.ensureJudgmentsDir();

        console.log(`JudgeService initialized with model: ${this.judgeModel}`);
        console.log(`Judgments will be saved to: ${this.judgmentsDir}`);
    }

    private ensureJudgmentsDir(): void {
        if (!fs.existsSync(this.judgmentsDir)) {
            fs.mkdirSync(this.judgmentsDir, { recursive: true });
            console.log(`Created judgments directory: ${this.judgmentsDir}`);
        }
    }
    /**
     * Compare generated SQL against expected SQL from test set
     */
    compareWithExpected(generatedSQL: string, expectedSQL: string): {
        exactMatch: boolean;
        normalizedMatch: boolean;
    } {
        const normalize = (sql: string) => sql
            .replace(/\s+/g, ' ')
            .replace(/["']/g, '"')
            .toLowerCase()
            .trim();

        const gen = normalize(generatedSQL);
        const exp = normalize(expectedSQL);

        return {
            exactMatch: generatedSQL === expectedSQL,
            normalizedMatch: gen === exp
        };
    }

    /**
     * Check if results count meets expected condition
     */
    checkResultsCount(actualCount: number, expectedCount: number | string): boolean {
        if (typeof expectedCount === 'number') {
            return actualCount === expectedCount;
        }
        // Handle strings like ">=1", ">=4", etc.
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

    /**
     * Use LLM to judge SQL quality when no expected SQL available
     */
async evaluateWithLLM(
    userPrompt: string,
    generatedSQL: string,
    results: any[]
): Promise<{ score: number; explanation: string }> {

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

Evaluate the SQL on these criteria:
1. Does it correctly answer the user's question?
2. Does it use correct table/column names with proper quoting?
3. Does it use appropriate joins if needed?
4. Are the results relevant to what was asked?

Score 1-5:
5 = Perfect - correctly answers, proper syntax, relevant results
4 = Good - minor issues but still correct
3 = Acceptable - answers partially but has issues
2 = Poor - doesn't answer correctly
1 = Wrong - completely incorrect or error

Return ONLY a JSON object with "score" (number) and "explanation" (string):`;

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

            // Handle case where response might not be valid JSON
            try {
                const result = JSON.parse(data.response);
                return {
                    score: result.score || 3,
                    explanation: result.explanation || 'No explanation provided'
                };
            } catch (e) {
                // If not JSON, extract score from text
                const scoreMatch = data.response.match(/[1-5]/);
                return {
                    score: scoreMatch ? parseInt(scoreMatch[0], 10) : 3,
                    // explanation: data.response.substring(0, 200)
                    explanation: data.response.trim() // provide full response, not only 200 characters
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
     * Save judgment to JSON file (OS-agnostic)
     */
    /**
 * Save judgment to JSON file (OS-agnostic) with SHORT filenames
 */
    async saveJudgment(judgment: Judgment): Promise<string> {
        // Add ID if not present
        const judgmentWithId = {
            id: randomUUID(),
            ...judgment,
            timestamp: judgment.timestamp instanceof Date
                ? judgment.timestamp
                : new Date(judgment.timestamp)
        };

        // SHORT timestamp: just YYYYMMDD-HHMMSS
        const date = judgmentWithId.timestamp;
        const shortTimestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;

        // SHORT ID: last 4 characters (easier to type/remember)
        const shortId = judgmentWithId.id.slice(-4);

        // SHORT query slug: just first 3-4 meaningful words
        const querySlug = judgment.naturalLanguageQuery
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .split('-')
            .filter(word => !['what', 'who', 'where', 'when', 'why', 'how', 'the', 'and', 'for', 'are', 'is', 'tell', 'about'].includes(word))
            .slice(0, 3) // Just first 3 meaningful words
            .join('-')
            .substring(0, 20);

        // SHORT filename: timestamp_id_query.json
        // Example: 20250217-143015_a1b2_cloud-security.json
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
     * Get judgment by ID (matches on full or partial ID)
     */
    async getJudgmentById(id: string): Promise<any | null> {
        try {
            const files = await fs.promises.readdir(this.judgmentsDir);

            // Filename pattern: timestamp_id_query.json
            // So we can just look for _id_ in the filename
            const matchingFile = files.find(file =>
                file.includes(`_${id}_`)  // Matches _a1b2_ in the filename
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
     * Get all judgments - also simpler using filenames
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