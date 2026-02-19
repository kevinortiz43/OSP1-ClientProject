import { type TextToSQLOptions } from "../types";
import { TABLE_NAMES, COLUMN_NAMES, CATEGORY_VALUES } from "../sql_db/schemas-helper";

/**
 * TEXT-TO-SQL Service
 * 
 * A DEVELOPMENT TOOL designed for rapid prototyping, NOT production use.
 * 
 * Purpose:
 * - Provide quick feedback during prompt engineering
 * - Test workflow integration before implementing proper SQL generation
 * - Mock the behavior of a text-to-SQL system
 * 
 * Limitations:
 * - Uses hardcoded table/column names (not schema-aware)
 * - Applies post-processing fixes that mask model errors
 * - Uses ILIKE for simplicity (not performance-optimized)
 * 
 */

export class AIService {
  private readonly modelUrl: string;
  private readonly modelName: string;

  // Constants imported from schemas-helper.ts for single source of truth
  // This ensures schema definitions stay consistent across the app
  private readonly TABLE_NAMES = TABLE_NAMES;
  private readonly COLUMN_NAMES = COLUMN_NAMES;
  private readonly CATEGORY_VALUES = CATEGORY_VALUES;

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
   * Extracts clean SQL from AI responses that might include explanations or markdown.
   * 
   * WHY: AI models often add explanations before/after the SQL, or wrap it in markdown
   * code blocks. This function extracts just the SQL query.
   * 
   * The regex handles three common formats:
   * 1. Raw SQL starting with SELECT and ending with ; 
   *    Example: "SELECT * FROM users;"
   *    
   * 2. SQL in markdown code blocks with sql tag
   *    Example: ```sql\nSELECT * FROM users;\n```
   *    
   * 3. SQL in plain markdown code blocks
   *    Example: ```\nSELECT * FROM users;\n```
   * 
   * The 'is' flags mean:
   * - 'i': case insensitive (though SELECT is usually uppercase)
   * - 's': dot matches newlines (allows matching across multiple lines)
   */
  private extractSQLFromResponse(sql: string): string {
    // Pattern breakdown:
    // SELECT.*?;        - Matches from "SELECT" to first ";" (non-greedy)
    // |                 - OR
    // ```sql\n         - Matches markdown code block start with sql tag
    // ([\s\S]*?)       - Captures anything (including newlines) non-greedy
    // \n```            - Matches closing code block
    // |                 - OR
    // ```\n([\s\S]*?)\n``` - Same but without sql tag
    const sqlMatch = sql.match(/SELECT.*?;|```sql\n([\s\S]*?)\n```|```\n([\s\S]*?)\n```/is);
    
    if (sqlMatch) {
      // sqlMatch[1] contains capture from sql-tagged block
      // sqlMatch[2] contains capture from plain code block
      // sqlMatch[0] contains the raw SELECT match
      // We return the first non-undefined capture, trimmed
      return (sqlMatch[1] || sqlMatch[2] || sqlMatch[0]).trim();
    }
    
    // If no pattern matches, return original (maybe it's already clean)
    return sql;
  }

  /**
   * Fixes double-double quotes that sometimes appear in AI-generated SQL.
   * 
   * WHY: Some AI models escape quotes by doubling them, which breaks PostgreSQL syntax.
   * Example: "SELECT ""firstName"" FROM users" -> "SELECT "firstName" FROM users"
   */
  private fixDoubleQuotes(sql: string): string {
    return sql.replace(/""/g, '"');
  }

  /**
   * Fixes a common hallucination where AI models write "UNION ALLER" instead of "UNION ALL".
   * 
   * WHY: Some models get confused between "ALL" and "ALLER" (French for "to go")
   * This is a known quirk with certain models.
   */
  private fixUnionAll(sql: string): string {
    return sql
      .replace(/UNION\s+ALLER/gi, 'UNION ALL')
      .replace(/UNION\s+ALL\s+ER/gi, 'UNION ALL'); // Handles "UNION ALL ER" typo
  }

  /**
   * Extracts table aliases from the SQL for logging/debugging purposes.
   * 
   * WHY: Helps understand how the AI is structuring queries and using aliases.
   * Not used for transformation, just monitoring.
   * 
   * Example: FROM "allTeams" t -> captures alias 't' pointing to table 'allTeams'
   */
  private extractAliases(sql: string): Map<string, string> {
    const aliasMap = new Map<string, string>();
    // Pattern: FROM or JOIN, then quoted table name, then alias word
    const aliasRegex = /(?:FROM|JOIN)\s+"([^"]+)"\s+(\w+)/gi;
    let match;
    
    while ((match = aliasRegex.exec(sql)) !== null) {
      aliasMap.set(match[2], match[1]); // match[2] is alias, match[1] is table name
      console.log(`Found alias: ${match[2]} -> ${match[1]}`);
    }
    
    return aliasMap;
  }

  /**
   * Main post-processing function that cleans and fixes AI-generated SQL.
   * 
   * WHY: AI models often generate SQL with syntax issues. This pipeline:
   * 1. Extracts clean SQL from AI response
   * 2. Fixes common syntax errors
   * 3. Ensures all identifiers are properly quoted (critical for camelCase)
   * 4. Normalizes category values to match database
   * 
   * Each step builds on the previous to progressively clean the SQL.
   */
  private ensureQuotedIdentifiers(sql: string): string {
    console.log("Original SQL from AI:", sql);
    
    // === STEP 1: Extract clean SQL ===
    // Remove any explanations, markdown, or extra text around the SQL
    sql = this.extractSQLFromResponse(sql);
    console.log("After extraction:", sql);

    // === STEP 2: Fix basic syntax errors ===
    // Fix double quotes and UNION hallucinations before processing identifiers
    sql = this.fixDoubleQuotes(sql);
    sql = this.fixUnionAll(sql);
    console.log("After fixing quotes and UNION:", sql);

    // === STEP 3: Extract aliases for logging ===
    // Just for debugging - helps understand query structure
    this.extractAliases(sql);

    // === STEP 4: Quote table names ===
    // Tables must be quoted because they contain camelCase or special chars
    // (?<!")\\b ensures we don't double-quote already quoted tables
    // (?!") ensures we don't quote inside existing quotes
    for (const tableName of this.TABLE_NAMES) {
      const regex = new RegExp(`(?<!")\\b${this.escapeRegExp(tableName)}\\b(?!")`, 'g');
      sql = sql.replace(regex, `"${tableName}"`);
    }
    console.log("After table quoting:", sql);

    // === STEP 5: Quote column names ===
    // Columns need quoting for camelCase (e.g., "firstName" not firstName)
    // Handle two cases: alias.column and standalone column
    for (const columnName of this.COLUMN_NAMES) {
      // Case 1: Column with alias (e.g., t.firstName -> t."firstName")
      const aliasColumnRegex = new RegExp(`(\\w+)\\.${this.escapeRegExp(columnName)}\\b`, 'g');
      sql = sql.replace(aliasColumnRegex, `$1."${columnName}"`);
      
      // Case 2: Standalone column (e.g., firstName -> "firstName")
      // Negative lookbehind (?<!\\.) ensures we don't match alias.columns
      // Negative lookahead (?!\\s*=) prevents matching in assignments
      const standaloneRegex = new RegExp(`(?<!\\.)\\b${this.escapeRegExp(columnName)}\\b(?!\\s*=)`, 'g');
      sql = sql.replace(standaloneRegex, `"${columnName}"`);
    }
    console.log("After column quoting:", sql);

    // === STEP 6: Fix single-quoted column names ===
    // Some models use 'columnName' instead of "columnName"
    // Convert known columns to double-quoted format
    const singleQuoteColRegex = /'([a-zA-Z]+)'/g;
    sql = sql.replace(singleQuoteColRegex, (match, colName) => {
      if (this.COLUMN_NAMES.includes(colName as any)) {
        return `"${colName}"`;
      }
      return match; // Not a column name, leave as-is
    });

    // === STEP 7: Normalize category values ===
    // Ensure categories use exact case from schema
    // Match any case variant (lowercase, uppercase) and replace with correct case
    for (const categoryValue of this.CATEGORY_VALUES) {
      const escapedValue = this.escapeRegExp(categoryValue);
      // Match: 'Cloud Security', 'cloud security', 'CLOUD SECURITY'
      const regex = new RegExp(`'${escapedValue}'|'${escapedValue.toLowerCase()}'|'${escapedValue.toUpperCase()}'`, 'gi');
      sql = sql.replace(regex, `'${categoryValue}'`);
    }

    // === STEP 8: Convert category = to ILIKE ===
    // WHY: Use case-insensitive matching for categories
    // Replace: WHERE category = 'Cloud Security' -> WHERE "category" ILIKE 'Cloud Security'
    sql = sql.replace(
      /WHERE\s+(\w+\.)?["']?category["']?\s*=\s*'([^']+)'/gi,
      'WHERE $1"category" ILIKE \'$2\''
    );

    // === STEP 9: Final cleanup ===
    // Remove any double quotes that might have been created by previous steps
    sql = this.fixDoubleQuotes(sql);
    
    console.log("Final SQL:", sql);
    return sql;
  }

  /**
   * Escapes special characters for use in RegExp.
   * 
   * WHY: When building regex patterns dynamically, we need to escape
   * characters that have special meaning in regex (. * + ? etc.)
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Builds the complete API endpoint URL.
   * 
   * WHY: Ensures consistent URL formatting by removing trailing slashes
   * and appending the OpenAI-compatible chat completions path.
   */
  private buildEndpoint(): string {
    const baseUrl = this.modelUrl.replace(/\/+$/, ''); // Remove trailing slashes
    return `${baseUrl}/v1/chat/completions`;
  }

  /**
   * Builds the system prompt for the AI model.
   * 
   * WHY: System prompt sets the context and rules for SQL generation.
   * Includes schema description and examples to guide the model.
   */
  private buildSystemPrompt(schemaDescription: string): string {
    return `You are a SQL expert for a security compliance database. 

CRITICAL RULES - YOU MUST FOLLOW:
1. Return ONLY the raw SQL query - NO explanations, NO markdown, NO backticks, NO introductory text
2. Table names MUST be double-quoted (they are shown in the schema below)
3. Column names MUST be double-quoted (all columns in the schema below are camelCase and need quotes)
4. Use ILIKE for all string comparisons (case-insensitive)
5. Category values must use EXACT case as shown in the schema
6. Joins between "allTeams" and other tables ARE PERMITTED when the query requires combining team information with controls or FAQs
7. Always use proper JOIN syntax with ON clauses
8. The response must be a single SQL statement ending with a semicolon

${schemaDescription}

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
WHERE t."role" = 'Technical Delivery Manager';`;
  }

  /**
   * Main public method: Converts natural language to SQL.
   * 
   * PIPELINE:
   * 1. Validate configuration
   * 2. Call AI model with system prompt and user question
   * 3. Extract and clean the SQL response
   * 4. Apply post-processing fixes
   * 5. Return clean, executable SQL
   */
  async textToSQL(options: TextToSQLOptions): Promise<string> {
    // Validate environment configuration
    if (!this.modelUrl || !this.modelName) {
      throw new Error('AI Model not configured. DMR environment variables missing.');
    }

    const { prompt, schemaDescription } = options;
    const endpoint = this.buildEndpoint();

    console.log('Calling AI model:', {
      endpoint,
      model: this.modelName,
      promptLength: prompt.length
    });

    // Call AI model with OpenAI-compatible API
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
        temperature: 0.1, // Low temperature for consistent, deterministic output
        max_tokens: 300,   // Limit response length
        stream: false
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI Model error (${response.status}): ${error}`);
    }

    const data = await response.json();
    let sql = data.choices[0].message.content.trim();
    
    // Apply post-processing fixes to ensure SQL is executable
    sql = this.ensureQuotedIdentifiers(sql);
    
    // Ensure SQL ends with semicolon (PostgreSQL requirement for multiple statements)
    if (!sql.endsWith(';')) {
      sql += ';';
    }

    console.log("Final cleaned SQL:", sql);
    return sql;
  }

  /**
   * Checks if the AI service is ready/available.
   * 
   * WHY: Used for health checks and to validate configuration before attempting queries.
   * Calls the models endpoint which is lighter than full completion.
   */
  async isReady(): Promise<boolean> {
    if (!this.modelUrl) return false;

    try {
      const baseUrl = this.modelUrl.replace(/\/+$/, '');
      // Use /v1/models endpoint which is faster than testing completion
      const response = await fetch(`${baseUrl}/v1/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      return response.ok;
    } catch {
      return false; // Any error means service is not ready
    }
  }
}