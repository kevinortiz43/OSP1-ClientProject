// aiService.ts

export interface TextToSQLOptions {
  /** The user's natural language question */
  prompt: string;
  
  /** Database schema description (generated from TypeScript types) */
  schemaDescription: string;
  
  /** Specific category filters if known */
  categories?: string[];
  
  /** Additional instructions for the AI */
  instructions?: string;
}

export class AIService {
  private readonly modelUrl: string;
  private readonly modelName: string;

  constructor() {
    this.modelUrl = process.env.TEXT2SQL_URL || '';
    this.modelName = process.env.TEXT2SQL_MODEL || '';
    
    console.log('AI Service initialized:', {
      url: this.modelUrl,
      model: this.modelName,
      hasUrl: !!this.modelUrl,
      hasModel: !!this.modelName
    });
  }

  /**
   * Convert natural language to SQL query.
   * 
   * REASONING: All prompt engineering is centralized here.
   * - Controller only provides raw data (question + schema)
   * - This service knows the domain (security compliance)
   * - Categories and rules are hardcoded here to avoid duplication
   */
  async textToSQL(options: TextToSQLOptions): Promise<string> {
    if (!this.modelUrl || !this.modelName) {
      throw new Error('AI Model not configured. DMR environment variables missing.');
    }

    const { prompt, schemaDescription, categories = [], instructions = '' } = options;

// Ensure modelUrl doesn't end with slash, then append path
const baseUrl = this.modelUrl.replace(/\/+$/, ''); 
const endpoint = `${baseUrl}/chat/completions`;
    
    /**
     * SYSTEM PROMPT - Defines the AI's role and behavior.
     * This is constant for all requests to ensure consistent output.
     */
const systemPrompt = `You are a SQL expert for a security compliance database.

CRITICAL SCHEMA RULES:
1. Table names must be double-quoted: "allTrustControls", "allTrustFaqs", "allTeams"
2. Column names with mixed case must be double-quoted: "searchText", "firstName", "lastName"
3. The 'category' column contains STRING VALUES, not column names
   - Valid category values: 'Cloud Security', 'Data Security', 'Organizational Security', 'Secure Development'
   - Use: WHERE category = 'Data Security'  (CORRECT)
   - NEVER: WHERE "Data Security" = ...    (WRONG - "Data Security" is not a column)

4. For text search, use: WHERE "searchText" ILIKE '%keyword%'
5. Return ONLY the SQL query - no explanations, no comments, no markdown
6. Always end with semicolon

Example of CORRECT SQL:
SELECT short, long FROM "allTrustControls" WHERE category = 'Data Security' AND "searchText" ILIKE '%incident%';

Example of CORRECT SQL with UNION:
SELECT short, long FROM "allTrustControls" WHERE category = 'Data Security' LIMIT 10
UNION ALL
SELECT question, answer FROM "allTrustFaqs" WHERE category = 'Data Security' LIMIT 10;`;

    /**
     * USER PROMPT - Contains the specific question and schema.
     * This varies per request.
     */
    const userPrompt = `Database schema:
${schemaDescription}

User question: ${prompt}

SQL query:`;

    console.log('Calling AI model:', { 
      endpoint, 
      model: this.modelName,
      promptLength: prompt.length 
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 300,
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI Model error (${response.status}): ${error}`);
    }

    const data = await response.json();
    let sql = data.choices[0].message.content.trim();
    
    // Clean SQL - remove markdown, extract first statement
    sql = sql.replace(/```sql\s*/gi, '').replace(/```\s*/gi, '');
    const sqlMatch = sql.match(/SELECT.*?;/i);
    if (sqlMatch) sql = sqlMatch[0];
    if (!sql.endsWith(';')) sql += ';';
    
    return sql;
  }

  async isReady(): Promise<boolean> {
    if (!this.modelUrl) return false;
    
    try {
      const baseUrl = this.modelUrl.replace('/v1', '');
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}