import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { type Judgment } from '../types'

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

        console.log(`[JUDGE] Calling model: ${this.judgeModel} for evaluation`);

        const prompt = `You are a SQL expert judge. Evaluate if this SQL correctly answers the user's question.

User Question: "${userPrompt}"

Generated SQL: 
\`\`\`sql
${generatedSQL}
\`\`\`

Results Returned (first 3 rows):
${JSON.stringify(results.slice(0, 3), null, 2)}

Score the SQL from 1-5 based on:
5 = Perfect - correctly answers the question
4 = Good - minor issues but still correct
3 = Acceptable - answers partially but has issues
2 = Poor - doesn't answer the question correctly
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
                        num_predict: 300
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
                    explanation: data.response.substring(0, 200)
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
    async saveJudgment(judgment: Judgment): Promise<string> {
        const timestamp = judgment.timestamp.toISOString().replace(/[:.]/g, '-');
        // Sanitize query for filename
        const querySlug = judgment.naturalLanguageQuery
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .substring(0, 30);

        const filename = `${timestamp}_${querySlug}.json`;
        const filepath = path.join(this.judgmentsDir, filename);

        await fs.promises.writeFile(
            filepath,
            JSON.stringify(judgment, null, 2),
            'utf-8'
        );

        console.log(`Judgment saved to: ${filepath}`);
        return filepath;
    }

    /**
     * Get all judgments (for potential admin endpoint)
     */
    async getAllJudgments(): Promise<Judgment[]> {
        if (!fs.existsSync(this.judgmentsDir)) {
            return [];
        }

        const files = await fs.promises.readdir(this.judgmentsDir);
        const judgments: Judgment[] = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const filepath = path.join(this.judgmentsDir, file);
                const content = await fs.promises.readFile(filepath, 'utf-8');
                try {
                    const judgment = JSON.parse(content);
                    judgment.timestamp = new Date(judgment.timestamp);
                    judgments.push(judgment);
                } catch (e) {
                    console.error(`Failed to parse judgment file: ${file}`);
                }
            }
        }

        // Sort by timestamp descending
        return judgments.sort((a, b) =>
            b.timestamp.getTime() - a.timestamp.getTime()
        );
    }
}