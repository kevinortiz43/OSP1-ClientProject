// export interface TextToSQLOptions {
//     question: string;
//     schemaDescription?: string;
//     categories?: string[];
//     instructions?: string;
// }

// export class AIService {
//     private readonly modelUrl: string;
//     private readonly modelName: string;

//     // hardcoded schema DDL (make dynamic later, if have time)
//     private readonly schemaDDL = 
//     `CREATE TABLE "allTrustControls" (
//     id VARCHAR(255) PRIMARY KEY,
//     category VARCHAR(255) NOT NULL,
//     short TEXT NOT NULL,
//     long TEXT NOT NULL,
//     searchText TEXT,
//     createdAt TIMESTAMP WITH TIME ZONE,
//     createdBy VARCHAR(255),
//     updatedAt TIMESTAMP WITH TIME ZONE,
//     updatedBy VARCHAR(255)
// );

// CREATE TABLE "allTrustFaqs" (
//     id VARCHAR(255) PRIMARY KEY,
//     question TEXT NOT NULL,
//     answer TEXT NOT NULL,
//     category VARCHAR(255),
//     searchText TEXT,
//     createdAt TIMESTAMP WITH TIME ZONE,
//     createdBy VARCHAR(255),
//     updatedAt TIMESTAMP WITH TIME ZONE,
//     updatedBy VARCHAR(255)
// );

// CREATE TABLE "allTeams" (
//     id VARCHAR(255) PRIMARY KEY,
//     firstName VARCHAR(255),
//     lastName VARCHAR(255),
//     role VARCHAR(255),
//     email VARCHAR(255),
//     isActive BOOLEAN,
//     employeeId INTEGER,
//     responseTimeHours NUMERIC(5,2),
//     category TEXT,
//     searchText TEXT,
//     createdAt TIMESTAMP WITH TIME ZONE,
//     createdBy VARCHAR(255),
//     updatedAt TIMESTAMP WITH TIME ZONE,
//     updatedBy VARCHAR(255)
// );`;

//     constructor() {
//         this.modelUrl = process.env.TEXT2SQL_URL || '';
//         this.modelName = process.env.TEXT2SQL_MODEL || '';

//         console.log('AI Service initialized:', {
//             url: this.modelUrl,
//             model: this.modelName,
//             hasUrl: !!this.modelUrl,
//             hasModel: !!this.modelName
//         });
//     }

//  private ensureQuotedIdentifiers(sql: string): string {
//     // 1. Fix double-double quotes
//     sql = sql.replace(/""([^""]+)""/g, '"$1"');
    
//     // 2. Fix UNION ALLER hallucination
//     sql = sql.replace(/UNION\s+ALLER/gi, 'UNION ALL');
//     sql = sql.replace(/UNION\s+ALL\s+ER/gi, 'UNION ALL');
    
//     // 3. Ensure table names are quoted (only tables!)
//     sql = sql.replace(/\ballTrustControls\b(?!")/gi, '"allTrustControls"');
//     sql = sql.replace(/\ballTrustFaqs\b(?!")/gi, '"allTrustFaqs"');
//     sql = sql.replace(/\ballTeams\b(?!")/gi, '"allTeams"');
    
//     // 4. Remove quotes from ALL columns (critical fix!)
//     const columns = [
//         'id', 'category', 'short', 'long', 'searchText', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy',
//         'question', 'answer', 'firstName', 'lastName', 'role', 'email', 'isActive', 'employeeId', 'responseTimeHours'
//     ];
    
//     columns.forEach(col => {
//         // Remove quotes if present (both "col" and `col`)
//         sql = sql.replace(new RegExp(`"${col}"`, 'g'), col);
//         sql = sql.replace(new RegExp('`' + col + '`', 'g'), col);
//     });
    
//     // 5. REMOVE BAD JOINS - teams shouldn't join with controls
//     if (sql.includes('"allTeams"') && sql.includes('JOIN') && 
//         (sql.includes('"allTrustControls"') || sql.includes('"allTrustFaqs"'))) {
//         const match = sql.match(/WHERE.*?category\s*LIKE\s*'%([^']+)%'/i);
//         if (match) {
//             const category = match[1];
//             sql = `SELECT firstName, lastName, role, email FROM "allTeams" WHERE category ILIKE '%${category}%' AND isActive = true;`;
//         } else {
//             sql = `SELECT firstName, lastName, role, email FROM "allTeams" WHERE isActive = true;`;
//         }
//     }
    
//     // 6. Convert LIKE to ILIKE for case-insensitive search
//     sql = sql.replace(/\bLIKE\b/gi, 'ILIKE');
    
//     return sql;
// }

//     /**
//      * Convert natural language to SQL query.
//      */
//     async textToSQL(options: TextToSQLOptions): Promise<string> {
//         if (!this.modelUrl || !this.modelName) {
//             throw new Error('AI Model not configured. Environment variables missing.');
//         }

//         const { question, categories = [], instructions = '' } = options;

//         // OpenAI-compatible endpoint
//         const baseUrl = this.modelUrl.replace(/\/+$/, '');
//         const endpoint = `${baseUrl}/v1/chat/completions`;

//         /**
//          * SYSTEM PROMPT - Chain of Thought approach for text-to-SQL
//          */
//  const systemPrompt = `You are a PostgreSQL expert for a security compliance database. Convert questions to SQL by following these steps:

// STEP 1 - Schema Analysis: Identify relevant tables and columns from the schema below
// STEP 2 - Question Decomposition: Break down what the question asks for
// STEP 3 - SQL Construction: Build the query following all rules
// STEP 4 - Final Output: Return ONLY the SQL query inside <SQL> tags

// <SQL_SCHEMA>
// ${this.schemaDDL}
// </SQL_SCHEMA>

// ## DATABASE TABLES (Quick Reference)
// - "allTrustControls": Security controls (id, category, short, long, searchText)
// - "allTrustFaqs": Frequently asked questions (id, category, question, answer, searchText)
// - "allTeams": Team members (id, firstName, lastName, role, email, category, searchText)

// ## CRITICAL RULES
// 1. **Quote ONLY table names**: Use double quotes for tables: "allTeams", "allTrustControls", "allTrustFaqs"
// 2. **Column names WITHOUT quotes**: Use column names as-is: firstName, lastName, category (PostgreSQL handles case)
// 3. **Text search**: Use ILIKE with wildcards: column ILIKE '%text%' (case-insensitive)
// 4. **Team categories**: For "allTeams".category (JSON array), use: category ILIKE '%Value%'
// 5. **No team joins**: NEVER join "allTeams" with other tables
// 6. **Valid categories**: 'Cloud Security', 'Data Security', 'Organizational Security', 'Secure Development', 'Privacy', 'Security Monitoring'
// 7. **Return ONLY the SQL** - no explanations, no markdown, no reasoning text

// ## EXAMPLES

// Question: Show me all cloud security controls
// SQL: SELECT id, short, long FROM "allTrustControls" WHERE category = 'Cloud Security';

// Question: Who works in data security?
// SQL: SELECT firstName, lastName, role, email FROM "allTeams" WHERE isActive = true AND category ILIKE '%Data Security%';

// Question: Find FAQs about API security
// SQL: SELECT question, answer FROM "allTrustFaqs" WHERE question ILIKE '%api%' OR answer ILIKE '%api%';

// Question: What's the average response time?
// SQL: SELECT AVG(responseTimeHours) as avg_response_time FROM "allTeams" WHERE isActive = true;

// Question: Search everything for 'incident response'
// SQL: SELECT 'control' as type, short as title, long as content FROM "allTrustControls" WHERE searchText ILIKE '%incident response%'
// UNION ALL
// SELECT 'faq' as type, question as title, answer as content FROM "allTrustFaqs" WHERE searchText ILIKE '%incident response%';

// Now process this question: ${question}

// <SQL>`;

//         console.log('Calling AI model:', {
//             endpoint,
//             model: this.modelName,
//             questionLength: question.length
//         });

//         // OpenAI-compatible request format
//         const response = await fetch(endpoint, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({
//                 model: this.modelName,
//                 messages: [
//                     { role: 'system', content: systemPrompt }
//                 ],
//                 temperature: 0.1,
//                 max_tokens: 800,
//                 stream: false
//             })
//         });

//         if (!response.ok) {
//             const error = await response.text();
//             throw new Error(`AI Model error (${response.status}): ${error}`);
//         }

//         // OpenAI-compatible response format
//         const data = await response.json();
//         let fullResponse = data.choices?.[0]?.message?.content?.trim() || '';

//       // ============= AGGRESSIVE SQL EXTRACTION =============
//     let sql = '';
    
//     // Strategy 1: Look for the LAST SELECT statement that's properly formatted
//     // This regex finds SELECT ... ; patterns, taking the last one
//     const selectRegex = /SELECT[\s\S]*?;/gi;
//     const matches = [...fullResponse.matchAll(selectRegex)];
    
//     if (matches.length > 0) {
//         // Take the last match (usually the actual SQL, not examples)
//         sql = matches[matches.length - 1][0].trim();
//     }
    
//     // Strategy 2: If that fails, try to find content after "### SQL Query:" or "SQL:"
//     if (!sql) {
//         const markers = [
//             /### SQL Query:\s*\n+([\s\S]*?)(?:\n\n|$)/i,
//             /SQL:\s*\n+([\s\S]*?)(?:\n\n|$)/i,
//             /```sql\n([\s\S]*?)\n```/i,
//             /```\n([\s\S]*?)\n```/i
//         ];
        
//         for (const marker of markers) {
//             const match = fullResponse.match(marker);
//             if (match && match[1]) {
//                 sql = match[1].trim();
//                 break;
//             }
//         }
//     }
    
//     // Strategy 3: If still no SQL, split by lines and find first line that starts with SELECT
//     if (!sql) {
//         const lines = fullResponse.split('\n');
//         let selectStarted = false;
//         let selectLines = [];
        
//         for (const line of lines) {
//             const trimmed = line.trim();
            
//             // If we find a line starting with SELECT, start collecting
//             if (!selectStarted && trimmed.toUpperCase().startsWith('SELECT')) {
//                 selectStarted = true;
//                 selectLines = [line];
//             } 
//             // If we're in a SELECT statement, keep collecting
//             else if (selectStarted) {
//                 selectLines.push(line);
//                 // Stop if we hit a semicolon and then a blank line
//                 if (trimmed.endsWith(';') && lines.indexOf(line) < lines.length - 1 && 
//                     lines[lines.indexOf(line) + 1].trim() === '') {
//                     break;
//                 }
//             }
//         }
        
//         if (selectLines.length > 0) {
//             sql = selectLines.join('\n');
//         }
//     }
    
//     // If we still don't have SQL, use fallback
//     if (!sql) {
//         console.warn('No SQL found in response, using fallback');
//         sql = this.getFallbackQuery(question);
//     }

//     // Clean up the SQL
//     sql = sql.replace(/```sql\n?/gi, '').replace(/```\n?/gi, '');
    
//     // Remove any lines that are clearly not SQL
//     const sqlLines = sql.split('\n').filter(line => {
//         const trimmed = line.trim();
//         // Keep lines that are SQL keywords or empty
//         return trimmed === '' || 
//                trimmed.match(/^(SELECT|FROM|WHERE|AND|OR|ORDER|GROUP|LIMIT|JOIN|UNION|LEFT|RIGHT|INNER)/i) ||
//                trimmed.match(/^[a-zA-Z0-9_,.() ]+$/); // Allow column names and punctuation
//     });
    
//     sql = sqlLines.join('\n');

//     // Apply identifier fixing (tables quoted, columns unquoted)
//     sql = this.ensureQuotedIdentifiers(sql);

//     // Validate SELECT statement
//     if (!sql.trim().toUpperCase().startsWith('SELECT')) {
//         console.warn('Invalid SQL generated, using fallback');
//         sql = this.getFallbackQuery(question);
//     }

//     if (!sql.trim().endsWith(';')) {
//         sql += ';';
//     }

//     console.log('Extracted SQL:', sql); // Add this for debugging
//     return sql;
// }

//     private getFallbackQuery(question: string): string {
//         const q = question.toLowerCase();
//         if (q.includes('team') || q.includes('who') || q.includes('person')) {
//             return 'SELECT "firstName", "lastName", "role", "email" FROM "allTeams" WHERE "isActive" = true LIMIT 10;';
//         } else if (q.includes('control') || q.includes('measure')) {
//             return 'SELECT "short", "long", "category" FROM "allTrustControls" LIMIT 10;';
//         } else if (q.includes('faq') || q.includes('question') || q.includes('ask')) {
//             return 'SELECT "question", "answer", "category" FROM "allTrustFaqs" LIMIT 10;';
//         } else {
//             return 'SELECT "short", "long" FROM "allTrustControls" LIMIT 5;';
//         }
//     }

//     async isReady(): Promise<boolean> {
//         if (!this.modelUrl) return false;

//         try {
//             const baseUrl = this.modelUrl.replace(/\/+$/, '');
//             const response = await fetch(`${baseUrl}/v1/models`, {
//                 method: 'GET',
//                 headers: { 'Content-Type': 'application/json' },
//                 signal: AbortSignal.timeout(5000)
//             });
//             return response.ok;
//         } catch {
//             return false;
//         }
//     }
// }