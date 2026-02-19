import { type TextToSQLOptions } from "../types";


/**
 * DEVELOPMENT TEXT-TO-SQL SERVICE
 * 
 * This is a DEVELOPMENT TOOL designed for rapid prototyping, NOT production use.
 * 
 * Purpose:
 * - Provide quick feedback during prompt engineering
 * - Test workflow integration before implementing proper SQL generation
 * - Mock the behavior of a production text-to-SQL system
 * 
 * Limitations:
 * - Uses hardcoded table/column names (not schema-aware)
 * - Applies post-processing fixes that mask model errors
 * - Uses ILIKE for simplicity (not performance-optimized)
 * 
 * For production, replace with:
 * - Fine-tuned SQL model (e.g., defog/sqlcoder)
 * - Proper schema integration without hardcoded fixes
 * - tsvector/tsquery for text search with GIN indexes
 * - Execution-based validation
 */


export class AIService {
  private readonly modelUrl: string;
  private readonly modelName: string;

  constructor() {
    this.modelUrl = process.env.TEXT2SQL_URL || '';
    this.modelName = process.env.TEXT2SQL_MODEL || '';


// private - The property can only be accessed within the class itself
// readonly - The property can only be set in the constructor, never changed after
// !! - The "double bang" operator converts any value to a boolean:
// Falsy values ('', 0, null, undefined, NaN, false) become false
// Truthy values (non-empty strings, numbers >0, objects, etc.) become true
// This is useful for logging - we want to know if values exist, not the actual values
    console.log('AI Service initialized:', {
      url: this.modelUrl,
      model: this.modelName,
      hasUrl: !!this.modelUrl,  // Converts string to boolean: '' → false, 'http://...' → true
      hasModel: !!this.modelName
    });
  }

  private ensureQuotedIdentifiers(sql: string): string {
  console.log("Original SQL from AI:", sql);
  
  // 1. FIRST, extract just the SQL query (remove any explanations)
  const sqlMatch = sql.match(/SELECT.*?;/is);
  if (sqlMatch) {
    sql = sqlMatch[0];
    console.log("After extraction:", sql);
  }

  // 2. Fix double-double quotes - IMPROVED REGEX
  // This matches ""anything"" and replaces with "anything"
  const doubleQuoteRegex = /""([^""]*)""/g;
  sql = sql.replace(doubleQuoteRegex, '"$1"');
  console.log("After fixing double quotes:", sql);

  // 3. Fix UNION ALLER hallucination
  sql = sql.replace(/UNION\s+ALLER/gi, 'UNION ALL');
  sql = sql.replace(/UNION\s+ALL\s+ER/gi, 'UNION ALL');

  // 4. Handle table aliases
  const aliasMap: Map<string, string> = new Map();
  const aliasRegex = /(?:FROM|JOIN)\s+"([^"]+)"\s+(\w+)/gi;
  let match;
  while ((match = aliasRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const alias = match[2];
    aliasMap.set(alias, tableName);
    console.log(`Found alias: ${alias} -> ${tableName}`);
  }

  // 5. Ensure table names are quoted
  const tableNames = ['allTrustControls', 'allTrustFaqs', 'allTeams'];
  for (const tableName of tableNames) {
    const regex = new RegExp(`(?<!")\\b${tableName}\\b(?!")`, 'g');
    sql = sql.replace(regex, `"${tableName}"`);
  }
  console.log("After table quoting:", sql);

  // 6. Ensure camelCase column names are quoted
  const columnNames = ['firstName', 'lastName', 'searchText', 'isActive', 'employeeId', 
                       'responseTimeHours', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy',
                       'short', 'long', 'question', 'answer', 'id', 'category', 'role', 'email'];
  
  for (const columnName of columnNames) {
    // Handle columns with aliases
    const aliasColumnRegex = new RegExp(`(\\w+)\\.${columnName}\\b`, 'g');
    sql = sql.replace(aliasColumnRegex, (match, alias) => {
      return `${alias}."${columnName}"`;
    });
    
    // Handle standalone columns
    const standaloneRegex = new RegExp(`(?<!\\.)\\b${columnName}\\b(?!\\s*=)`, 'g');
    sql = sql.replace(standaloneRegex, `"${columnName}"`);
  }
  console.log("After column quoting:", sql);

  // 7. Fix single-quoted column names (but don't double-quote already quoted ones)
  const singleQuoteColRegex = /'([a-zA-Z]+)'/g;
  sql = sql.replace(singleQuoteColRegex, (match, colName) => {
    // Only convert to double-quotes if it's a known column name AND not already quoted
    if (columnNames.includes(colName) && !sql.includes(`"${colName}"`)) {
      return `"${colName}"`;
    }
    return match;
  });

  // 8. Fix category values to proper case
  const categoryValues = [
    'Cloud Security',
    'Data Security', 
    'Organizational Security',
    'Secure Development',
    'Privacy',
    'Security Monitoring'
  ];
  
  for (const categoryValue of categoryValues) {
    const regex = new RegExp(`'${this.escapeRegExp(categoryValue)}'|'${this.escapeRegExp(categoryValue.toLowerCase())}'|'${this.escapeRegExp(categoryValue.toUpperCase())}'`, 'gi');
    sql = sql.replace(regex, `'${categoryValue}'`);
  }

  // 9. REMOVE BAD JOINS
  if (sql.includes('"allTeams"') && sql.includes('JOIN') && sql.includes('"allTrustControls"')) {
    const match = sql.match(/WHERE\s+.*?"allTrustControls"\.category\s*=\s*'([^']+)'/i);
    if (match) {
      const category = match[1];
      sql = `SELECT "firstName", "lastName", "role" FROM "allTeams" WHERE "category" ILIKE '${category}';`;
    }
  }

  // 10. Convert category = 'value' to category ILIKE 'value'
  sql = sql.replace(/WHERE\s+(\w+\.)?"category"\s*=\s*'([^']+)'/gi, 'WHERE $1"category" ILIKE \'$2\'');
  sql = sql.replace(/WHERE\s+(\w+\.)?category\s*=\s*'([^']+)'/gi, 'WHERE $1"category" ILIKE \'$2\'');

  // FINAL FIX: Remove any remaining double-double quotes that might have been created
  sql = sql.replace(/""/g, '"');
  
  console.log("Final SQL:", sql);
  return sql;
}

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Convert natural language to SQL query.
   */
  async textToSQL(options: TextToSQLOptions): Promise<string> { // pass in options object input here (which includes schemaDescriiption)
    if (!this.modelUrl || !this.modelName) {
      throw new Error('AI Model not configured. DMR environment variables missing.');
    }

    const { prompt } = options;

    // Ensure modelUrl doesn't end with slash
    const baseUrl = this.modelUrl.replace(/\/+$/, ''); // Removes trailing slashes: "http://localhost:11434/" → "http://localhost:11434"
    const endpoint = `${baseUrl}/v1/chat/completions`; // "http://localhost:11434/v1/chat/completions"

// Port 11434 is the default port for Ollama (as LLM server)
// Ollama provides an OpenAI-compatible API endpoint at /v1/chat/completions
// This means we can use the same API format as OpenAI but run models locally
// The URL structure matches OpenAI's API for compatibility:
// OpenAI URL: https://api.openai.com/v1/chat/completions
// Ollama URL (similar to openAI above): http://localhost:11434/v1/chat/completions


    // UPDATED system prompt with correct quoting rules
 const systemPrompt = `You are a SQL expert for a security compliance database. 

CRITICAL RULES - YOU MUST FOLLOW:
1. Return ONLY the raw SQL query - NO explanations, NO markdown, NO backticks, NO introductory text
2. Table names MUST be double-quoted (they are shown in the schema below)
3. Column names MUST be double-quoted (all columns in the schema below are camelCase and need quotes)
4. Use ILIKE for all string comparisons (case-insensitive)
5. Category values must use EXACT case as shown in the schema
6. NEVER join "allTeams" with other tables
7. The response must be a single SQL statement ending with a semicolon

${options.schemaDescription}

EXAMPLES - All identifiers are properly quoted:

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
SELECT "firstName", "lastName", "email" FROM "allTeams" WHERE "role" ILIKE '%manager%';

-- Example with table aliases (columns must still be quoted):
SELECT t."firstName", t."lastName", c."short" 
FROM "allTeams" t 
JOIN "allTrustControls" c ON t."category" = c."category" 
WHERE t."role" = 'Technical Delivery Manager';
`;


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