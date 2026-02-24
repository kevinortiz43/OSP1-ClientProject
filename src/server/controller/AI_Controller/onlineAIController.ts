import { AI_APIKEY, model } from "../../envVariables";
import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient(AI_APIKEY);

interface AIResponseInput {
  naturalLanguageQuery: string;
  sqlQuery: string;
}

interface AIResponseOutput {
  databaseQuery?: string;
  cleanSQL?: string;
}

export async function QueryOpenAI({
  naturalLanguageQuery,
}: AIResponseInput): Promise<AIResponseOutput> {
  if (!naturalLanguageQuery) {
    throw new Error("QueryOpenAI did not receive a query");
  }

  const systemPrompt = `You are a SQL expert for a security compliance database.
  
CRITICAL SCHEMA RULES:
1. Table names MUST be double-quoted: "allTrustControls", "allTrustFaqs"
2. Column "searchText" MUST be double quoted because it has mixed case: "searchText"
3. Other columns are lowercase and don't need quotes: short, long, question, answer, category
4. The 'category' column contains STRING VALUES
   - Valid values: 'Cloud Security', 'Data Security', 'Organizational Security', 'Secure Development'

DATABASE SCHEMA:

Table: "allTrustControls"
Columns:
  - id (character varying)
  - category (text) - values: 'Cloud Security', 'Data Security', 'Organizational Security', 'Secure Development'
  - short (text) - brief description
  - long (text) - detailed description
  - "searchText" (text) - MUST BE QUOTED - full-text search field
  - createdAt, createdBy, updatedAt, updatedBy (metadata)

Table: "allTrustFaqs"
Columns:
  - id (character varying)
  - question (text)
  - answer (text)
  - categories (jsonb)
  - "searchText" (text) - MUST BE QUOTED - full-text search field
  - createdAt, createdBy, updatedAt, updatedBy (metadata)

QUERY GENERATION RULES:
1. Search "allTrustControls" for security controls and policies
2. Search "allTrustFaqs" for frequently asked questions
3. Use WHERE "searchText" ILIKE '%keyword%' for text searches (NOTE: "searchText" must be quoted!)
4. Extract 2 4 key search terms from the user's question
5. Combine terms with OR for broader results, AND for narrower results
6. Always LIMIT results to 10 rows
7. Return ONLY the SQL query - no explanations, no markdown
8. Always end with semicolon

CORRECT EXAMPLES:

User: "How are tenants segregated?"
Query: SELECT short, long FROM "allTrustControls" WHERE "searchText" ILIKE '%tenant%' OR "searchText" ILIKE '%segregat%' LIMIT 10;

User: "What is our incident response plan?"
Query: SELECT short, long FROM "allTrustControls" WHERE "searchText" ILIKE '%incident%' AND "searchText" ILIKE '%response%' LIMIT 10;

User: "API security measures"
Query: SELECT short, long FROM "allTrustControls" WHERE "searchText" ILIKE '%api%' OR "searchText" ILIKE '%security%' LIMIT 10;

User: "Data encryption policy"
Query: SELECT question, answer FROM "allTrustFaqs" WHERE "searchText" ILIKE '%encryption%' OR "searchText" ILIKE '%data%' LIMIT 10;

User: "Cloud security controls"
Query: SELECT short, long FROM "allTrustControls" WHERE category = 'Cloud Security' LIMIT 10;

Now convert this query: "${naturalLanguageQuery}"

CRITICAL: Remember to quote "searchText" - it MUST be "searchText" not searchText or searchtext!`;

  try {
    const chatCompletion = await client.chatCompletion({
      model,
      messages: [{ role: "system", content: systemPrompt }],
      max_tokens: 200,
      temperature: 0.3,
    });

    const sqlQuery = chatCompletion.choices[0].message.content?.trim();
    let cleanSql = sqlQuery?.replace(/```sql\s*/gi, "").replace(/```\s*/gi, "");

    const sqlMatch = cleanSql?.match(/SELECT.*?;/is);
    if (sqlMatch) cleanSql = sqlMatch[0];

    cleanSql = cleanSql
      ?.replace(/FROM\s+allTrustControls/gi, 'FROM "allTrustControls"')
      .replace(/FROM\s+allTrustFaqs/gi, 'FROM "allTrustFaqs"')
      .replace(/JOIN\s+allTrustControls/gi, 'JOIN "allTrustControls"')
      .replace(/JOIN\s+allTrustFaqs/gi, 'JOIN "allTrustFaqs"');

    cleanSql = cleanSql
      ?.replace(/\bsearchtext\b/gi, '"searchText"')
      ?.replace(/\bsearchText\b/g, '"searchText"')
      ?.replace(/\b"searchText"\b/g, '"searchText"')
      ?.replace(/"+"searchText""+/g, '"searchText"');

    cleanSql = cleanSql
      ?.replace(/WHERE\s+WHERE/gi, "WHERE")
      ?.replace(/"\s*"\s*searchText\s*"\s*"/gi, '"searchText"');

    if (!cleanSql?.endsWith(";")) cleanSql += ";";

    return { databaseQuery: sqlQuery, cleanSQL: cleanSql };
  } catch (error) {
    console.error("Error generating SQL query:", error);
    throw new Error(
      `QueryOpenAI error: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
