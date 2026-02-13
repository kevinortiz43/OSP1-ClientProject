export interface TextToSQLOptions {
    prompt: string;
    schemaDescription: string;
    categories?: string[];
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

  private ensureQuotedIdentifiers(sql: string): string {
    // 1. FIRST, extract just the SQL query (remove any explanations)
    const sqlMatch = sql.match(/SELECT.*?;/is);
    if (sqlMatch) {
      sql = sqlMatch[0];
    }

    // 2. Fix double-double quotes
    sql = sql.replace(/""([^""]+)""/g, '"$1"');

    // 3. Fix UNION ALLER hallucination
    sql = sql.replace(/UNION\s+ALLER/gi, 'UNION ALL');
    sql = sql.replace(/UNION\s+ALL\s+ER/gi, 'UNION ALL');

    // 4. Ensure table names are quoted
    const tableNames = ['allTrustControls', 'allTrustFaqs', 'allTeams'];
    for (const tableName of tableNames) {
      // Match the table name when it's NOT already quoted
      const regex = new RegExp(`(?<!")${tableName}(?!")`, 'g');
      sql = sql.replace(regex, `"${tableName}"`);
    }

    // 5. Ensure camelCase column names are quoted (PostgreSQL requirement)
    const columnNames = ['firstName', 'lastName', 'searchText', 'isActive', 'employeeId', 'responseTimeHours', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'];
    for (const columnName of columnNames) {
      // Match the column name when it's NOT already quoted
      const regex = new RegExp(`(?<!")${columnName}(?!")`, 'g');
      sql = sql.replace(regex, `"${columnName}"`);
    }

    // 6. Fix category values to proper case
    const categoryValues = [
      'Cloud Security',
      'Data Security', 
      'Organizational Security',
      'Secure Development',
      'Privacy',
      'Security Monitoring'
    ];
    
    for (const categoryValue of categoryValues) {
      // Case-insensitive replace of category values with correct case
      const regex = new RegExp(`'${this.escapeRegExp(categoryValue)}'|'${this.escapeRegExp(categoryValue.toLowerCase())}'|'${this.escapeRegExp(categoryValue.toUpperCase())}'`, 'gi');
      sql = sql.replace(regex, `'${categoryValue}'`);
    }

    // 7. REMOVE BAD JOINS
    if (sql.includes('"allTeams"') && sql.includes('JOIN') && sql.includes('"allTrustControls"')) {
      const match = sql.match(/WHERE\s+.*?"allTrustControls"\.category\s*=\s*'([^']+)'/i);
      if (match) {
        const category = match[1];
        sql = `SELECT "firstName", "lastName", "role" FROM "allTeams" WHERE "category" ILIKE '${category}';`;
      }
    }

    // 8. Convert category = 'value' to category ILIKE 'value' and ensure column quotes
    sql = sql.replace(/WHERE\s+(\w+\.)?"category"\s*=\s*'([^']+)'/gi, 'WHERE $1"category" ILIKE \'$2\'');
    sql = sql.replace(/WHERE\s+(\w+\.)?category\s*=\s*'([^']+)'/gi, 'WHERE $1"category" ILIKE \'$2\'');

    return sql;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Convert natural language to SQL query.
   */
  async textToSQL(options: TextToSQLOptions): Promise<string> {
    if (!this.modelUrl || !this.modelName) {
      throw new Error('AI Model not configured. DMR environment variables missing.');
    }

    const { prompt, schemaDescription } = options;

    // Ensure modelUrl doesn't end with slash
    const baseUrl = this.modelUrl.replace(/\/+$/, '');
    const endpoint = `${baseUrl}/v1/chat/completions`;

    // UPDATED system prompt with correct quoting rules
    const systemPrompt = `You are a SQL expert for a security compliance database. 

CRITICAL RULES - YOU MUST FOLLOW:
1. Return ONLY the raw SQL query - NO explanations, NO markdown, NO backticks, NO introductory text
2. Table names MUST be double-quoted: "allTrustControls", "allTrustFaqs", "allTeams"
3. Column names MUST be double-quoted if they are camelCase: "firstName", "lastName", "searchText", "isActive", "employeeId", "responseTimeHours", "createdAt", "updatedAt"
4. Use ILIKE for all string comparisons (case-insensitive)
5. Category values must use EXACT case: 'Cloud Security', 'Data Security', 'Organizational Security', 'Secure Development', 'Privacy', 'Security Monitoring'
6. NEVER join "allTeams" with other tables
7. The response must be a single SQL statement ending with a semicolon

Database schema:
CREATE TABLE "allTrustControls" (
    "id" VARCHAR(255) PRIMARY KEY,
    "category" VARCHAR(255) NOT NULL,
    "short" TEXT NOT NULL,
    "long" TEXT NOT NULL,
    "searchText" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE,
    "createdBy" VARCHAR(255),
    "updatedAt" TIMESTAMP WITH TIME ZONE,
    "updatedBy" VARCHAR(255)
);

CREATE TABLE "allTrustFaqs" (
    "id" VARCHAR(255) PRIMARY KEY,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" VARCHAR(255),
    "searchText" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE,
    "createdBy" VARCHAR(255),
    "updatedAt" TIMESTAMP WITH TIME ZONE,
    "updatedBy" VARCHAR(255)
);

CREATE TABLE "allTeams" (
    "id" VARCHAR(255) PRIMARY KEY,
    "firstName" VARCHAR(255),
    "lastName" VARCHAR(255),
    "role" VARCHAR(255),
    "email" VARCHAR(255),
    "isActive" BOOLEAN,
    "employeeId" INTEGER,
    "responseTimeHours" NUMERIC(5,2),
    "category" TEXT,
    "searchText" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE,
    "createdBy" VARCHAR(255),
    "updatedAt" TIMESTAMP WITH TIME ZONE,
    "updatedBy" VARCHAR(255)
);

EXAMPLES - Note: BOTH table and column names are QUOTED:

-- Find who handles security incidents:
SELECT "firstName", "lastName", "email", "role" FROM "allTeams" WHERE "role" ILIKE '%security%' OR "role" ILIKE '%incident%' OR "searchText" ILIKE '%security incident%';

-- Teams by category with exact case:
SELECT "firstName", "lastName", "role" FROM "allTeams" WHERE "category" ILIKE 'Cloud Security';

-- Controls by category:
SELECT "short", "long" FROM "allTrustControls" WHERE "category" ILIKE 'Data Security';

-- FAQs by category:
SELECT "question", "answer" FROM "allTrustFaqs" WHERE "category" ILIKE 'Cloud Security';

-- Find active team members:
SELECT "firstName", "lastName", "email" FROM "allTeams" WHERE "isActive" = true;

-- Search controls by keyword:
SELECT "short", "long" FROM "allTrustControls" WHERE "searchText" ILIKE '%encryption%';

-- Find people by role:
SELECT "firstName", "lastName", "email" FROM "allTeams" WHERE "role" ILIKE '%manager%';`;

    const userPrompt = `Database schema is provided above.

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
        stream: false
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI Model error (${response.status}): ${error}`);
    }

    const data = await response.json();
    let sql = data.choices[0].message.content.trim();
    
    // Apply fixes
    sql = this.ensureQuotedIdentifiers(sql);
    
    // Final cleanup - ensure it ends with semicolon
    if (!sql.endsWith(';')) sql += ';';

    console.log("Final cleaned SQL:", sql);
    return sql;
  }

  async isReady(): Promise<boolean> {
    if (!this.modelUrl) return false;

    try {
      const baseUrl = this.modelUrl.replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/v1/models`, {
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