import { type TextToSQLOptions } from "../types";
import { TABLE_NAMES, COLUMN_NAMES, CATEGORY_VALUES } from "../sql_db/schemas-helper";


/**
 * TEXT-TO-SQL Service
 * 
 * A DEVELOPMENT TOOL designed for rapid prototyping, NOT production use.
 * 
 * Purpose:
 * - Provide quick feedback during prompt engineering using lightweight, open source models
 * - Test workflow integration before implementing proper SQL generation
 * - Mock the behavior of a text-to-SQL system
 * 
 * Limitations:
 * - Prompt tailored to specific mock data and weaker AI model
 * - Applies post-processing fixes that mask model errors
 * - Uses ILIKE for simplicity (not performance-optimized)
 */

export class AIService {
  private readonly modelUrl: string;
  private readonly modelName: string;

  // Constants imported from schemas-helper.ts as single source of truth
  private readonly TABLE_NAMES = TABLE_NAMES;
  private readonly COLUMN_NAMES = COLUMN_NAMES;
  private readonly CATEGORY_VALUES = CATEGORY_VALUES;

  constructor() {
    this.modelUrl = process.env.MODEL_URL || '';
    this.modelName = process.env.TEXT2SQL_MODEL || '';

    console.log('AI Service initialized:', {
      url: this.modelUrl,
      model: this.modelName,
      hasUrl: !!this.modelUrl,
      hasModel: !!this.modelName
    });
  }

   private extractSQLFromResponse(sql: string): string {
    // Extract just the SQL query, removing any explanations or markdown
    const sqlMatch = sql.match(/SELECT.*?;|```sql\n([\s\S]*?)\n```|```\n([\s\S]*?)\n```/is);
    if (sqlMatch) {
      // Handle different extraction cases
      return (sqlMatch[1] || sqlMatch[2] || sqlMatch[0]).trim();
    }
    return sql;
  }

  private fixDoubleQuotes(sql: string): string {
    // Remove any double-double quotes
    return sql.replace(/""/g, '"');
  }

  private fixUnionAll(sql: string): string {
    // Fix common UNION hallucinations
    return sql
      .replace(/UNION\s+ALLER/gi, 'UNION ALL')
      .replace(/UNION\s+ALL\s+ER/gi, 'UNION ALL');
  }

  private extractAliases(sql: string): Map<string, string> {
    const aliasMap = new Map<string, string>();
    const aliasRegex = /(?:FROM|JOIN)\s+"([^"]+)"\s+(\w+)/gi;
    let match;
    
    while ((match = aliasRegex.exec(sql)) !== null) {
      aliasMap.set(match[2], match[1]);
      console.log(`Found alias: ${match[2]} -> ${match[1]}`);
    }
    
    return aliasMap;
  }

  private ensureQuotedIdentifiers(sql: string): string {
    console.log("Original SQL from AI:", sql);
    
    // 1. Extract just the SQL query
    sql = this.extractSQLFromResponse(sql);
    console.log("After extraction:", sql);

    // 2. Fix double quotes and UNION hallucinations
    sql = this.fixDoubleQuotes(sql);
    sql = this.fixUnionAll(sql);
    console.log("After fixing quotes and UNION:", sql);

    // 3. Extract aliases for logging
    this.extractAliases(sql);

    // 4. Ensure table names are quoted
    for (const tableName of this.TABLE_NAMES) {
      const regex = new RegExp(`(?<!")\\b${this.escapeRegExp(tableName)}\\b(?!")`, 'g');
      sql = sql.replace(regex, `"${tableName}"`);
    }
    console.log("After table quoting:", sql);

    // 5. Ensure camelCase column names are quoted
    for (const columnName of this.COLUMN_NAMES) {
      // Handle columns with aliases
      const aliasColumnRegex = new RegExp(`(\\w+)\\.${this.escapeRegExp(columnName)}\\b`, 'g');
      sql = sql.replace(aliasColumnRegex, `$1."${columnName}"`);
      
      // Handle standalone columns
      const standaloneRegex = new RegExp(`(?<!\\.)\\b${this.escapeRegExp(columnName)}\\b(?!\\s*=)`, 'g');
      sql = sql.replace(standaloneRegex, `"${columnName}"`);
    }
    console.log("After column quoting:", sql);

    // 6. Fix single-quoted column names (consolidated with column quoting check)
    const singleQuoteColRegex = /'([a-zA-Z]+)'/g;
    sql = sql.replace(singleQuoteColRegex, (match, colName) => {
      if (this.COLUMN_NAMES.includes(colName as any)) {
        return `"${colName}"`;
      }
      return match;
    });

    // 7. Fix category values to proper case
    for (const categoryValue of this.CATEGORY_VALUES) {
      const escapedValue = this.escapeRegExp(categoryValue);
      const regex = new RegExp(`'${escapedValue}'|'${escapedValue.toLowerCase()}'|'${escapedValue.toUpperCase()}'`, 'gi');
      sql = sql.replace(regex, `'${categoryValue}'`);
    }

    // 8. Convert category = 'value' to category ILIKE 'value'
    sql = sql.replace(
      /WHERE\s+(\w+\.)?["']?category["']?\s*=\s*'([^']+)'/gi,
      'WHERE $1"category" ILIKE \'$2\''
    );

    // 9. Final cleanup of any remaining double quotes
    sql = this.fixDoubleQuotes(sql);
    
    console.log("Final SQL:", sql);
    return sql;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

 private buildSystemPrompt(schemaDescription: string): string {

 // create formatted list of category values for the prompt
  const categoryList = CATEGORY_VALUES.map(c => `'${c}'`).join(', ');

    return `You are a SQL expert for a security compliance database. 

CRITICAL RULES - YOU MUST FOLLOW:
1. Return ONLY the raw SQL query - NO explanations, NO markdown, NO backticks, NO introductory text
2. Table names MUST be double-quoted (they are shown in the schema below)
3. Column names MUST be double-quoted (all columns in the schema below are camelCase and need quotes)
4. Use ILIKE for all string comparisons (case-insensitive)
5. Category values must use EXACT case as shown in the schema. Valid categories are: ${categoryList}
6. Joins between "allTeams" and other tables ARE PERMITTED when the query requires combining team information with controls or FAQs
7. Always use proper JOIN syntax with ON clauses
8. The response must be a single SQL statement ending with a semicolon
9. INCLUDE "category" IN SELECT ONLY WHEN NEEDED: 
   - If the user mentions a SPECIFIC category (in ${categoryList}), you MUST include the "category" field in SELECT
   - If the user asks for "all" items or general lists without category filtering, you do NOT need to include category
   - For aggregation queries (COUNT, AVG, MAX, etc.), include category only if grouping by it

${schemaDescription}

EXAMPLES - All identifiers are properly quoted:

-- Find who handles security incidents (NO category mentioned → category NOT needed):
SELECT "firstName", "lastName", "email", "role" FROM "allTeams" WHERE "role" ILIKE '%security%' OR "role" ILIKE '%incident%' OR "searchText" ILIKE '%security incident%';

-- Teams by category with exact case (category 'Cloud Security' mentioned → MUST include category):
SELECT "firstName", "lastName", "role", "category" FROM "allTeams" WHERE "category" ILIKE 'Cloud Security';

-- Controls by category (category 'Data Security' mentioned → MUST include category):
SELECT "short", "long", "category" FROM "allTrustControls" WHERE "category" ILIKE 'Data Security';

-- FAQs by category (category 'Cloud Security' mentioned → MUST include category):
SELECT "question", "answer", "category" FROM "allTrustFaqs" WHERE "category" ILIKE 'Cloud Security';

-- Find active team members (NO category mentioned → category NOT needed):
SELECT "firstName", "lastName", "email" FROM "allTeams" WHERE "isActive" = true;

-- Search controls by keyword (NO category mentioned → category NOT needed):
SELECT "short", "long" FROM "allTrustControls" WHERE "searchText" ILIKE '%encryption%';

-- Find people by role (NO category mentioned → category NOT needed):
SELECT "firstName", "lastName", "email" FROM "allTeams" WHERE "role" ILIKE '%manager%';

-- Example with table aliases (category mentioned in JOIN condition → include category):
SELECT t."firstName", t."lastName", c."short", t."category" 
FROM "allTeams" t 
JOIN "allTrustControls" c ON t."category" = c."category" 
WHERE t."role" = 'Technical Delivery Manager';

-- AGGREGATION FUNCTION EXAMPLES 
-- Count total team members (NO category mentioned → category NOT needed):
SELECT COUNT(*) as "totalMembers" FROM "allTeams";

-- Count by category (grouping by category → MUST include category):
SELECT "category", COUNT(*) as "memberCount" FROM "allTeams" GROUP BY "category";

-- Average response time (NO category mentioned → category NOT needed):
SELECT AVG("responseTimeHours") as "avgResponseTime" FROM "allTeams";

-- Maximum (longest) response time (NO category mentioned → category NOT needed):
SELECT MAX("responseTimeHours") as "longestResponseTime" FROM "allTeams";

-- Minimum (shortest) response time (NO category mentioned → category NOT needed):
SELECT MIN("responseTimeHours") as "shortestResponseTime" FROM "allTeams";

-- Get the team member(s) with longest response time (NO category mentioned → category NOT needed):
SELECT "firstName", "lastName", "email", "role", "responseTimeHours" 
FROM "allTeams" 
WHERE "responseTimeHours" = (SELECT MAX("responseTimeHours") FROM "allTeams");

-- Longest response times for security team (category implied by 'security team' → include category):
SELECT "firstName", "lastName", "email", "role", "category", "responseTimeHours" 
FROM "allTeams" 
WHERE "role" ILIKE '%security%' 
AND "responseTimeHours" = (SELECT MAX("responseTimeHours") FROM "allTeams" WHERE "role" ILIKE '%security%');

-- Sum of response times (NO category mentioned → category NOT needed):
SELECT SUM("responseTimeHours") as "totalResponseTime" FROM "allTeams";

-- Multiple aggregations in one query (NO category mentioned → category NOT needed):
SELECT 
  COUNT(*) as "totalMembers",
  AVG("responseTimeHours") as "avgResponseTime",
  MAX("responseTimeHours") as "maxResponseTime",
  MIN("responseTimeHours") as "minResponseTime"
FROM "allTeams";`;
}

  async textToSQL(options: TextToSQLOptions): Promise<string> {
    if (!this.modelUrl || !this.modelName) {
      throw new Error('AI Model not configured. DMR environment variables missing.');
    }

    const { prompt, schemaDescription } = options;
    const endpoint = process.env.MODEL_URL || 'http://ollama:11434/v1/chat/completions';

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
          { role: 'system', content: this.buildSystemPrompt(schemaDescription) },
          { role: 'user', content: `Database schema is provided above.

User question: ${prompt}

SQL query:` }
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
    
    // Ensure it ends with semicolon
    if (!sql.endsWith(';')) {
      sql += ';';
    }

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