import type { RequestHandler } from "express";
import type { ServerError } from "./types";
import "dotenv/config";
import { InferenceClient } from "@huggingface/inference";

const { AI_APIKEY } = process.env;

const client = new InferenceClient("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");

export const QueryOpenAI: RequestHandler = async (_, res, next) => {
  try {
    const { naturalLanguageQuery } = res.locals;

    if (!naturalLanguageQuery) {
      const error: ServerError = {
        log: "OpenAI query middleware did not receive a query",
        status: 500,
        message: { err: "An error occured before querying Hugging Face" },
      };
      return next(error);
    }

    const systemPrompt = `
You are a SQL assistant that converts natural language queries into valid PostgreSQL SELECT statements. 
Only respond with the SQL query, no explanations or markdown formatting.

Database Schema:

CREATE TABLE "allTrustControls" (
  id CHARACTER VARYING(255) PRIMARY KEY,
  category TEXT,
  short TEXT,
  long TEXT,
  searchText TEXT,
  createdAt TIMESTAMP WITH TIME ZONE,
  createdBy TEXT,
  updatedAt TIMESTAMP WITH TIME ZONE,
  updatedBy TEXT
);

CREATE TABLE "allTrustFaqs" (
  id CHARACTER VARYING(255) PRIMARY KEY,
  question TEXT,
  answer TEXT,
  categories
  searchText TEXT,
  createdAt TIMESTAMP WITH TIME ZONE,
  createdBy TEXT,
  updatedBy TIMESTAMP WITH TIME ZONE,
  updatedBy TEXT
);

Examples:

User: "Find FAQs about security"
Query: SELECT * FROM "allTrustFaqs" WHERE searchText ILIKE '%security%';

User: "Show controls in the compliance category"
Query: SELECT * FROM "allTrustControls" WHERE category ILIKE '%compliance%';

User: "Get all FAQs created this year"
Query: SELECT * FROM "allTrustFaqs" WHERE EXTRACT(YEAR FROM createdAt) = EXTRACT(YEAR FROM CURRENT_DATE);

User: "Find controls with 'encryption' in short or long description"
Query: SELECT * FROM "allTrustControls" WHERE short ILIKE '%encryption%' OR long ILIKE '%encryption%';

IMPORTANT: Always use double quotes around table names to preserve case sensitivity. 
Use only the above categories to preserve case sensibility. 

For example: Use searchText not searchtext
Instructions:
1. Carefully read user prompt
2. Identify keywords matching table properties in database
3. Convert prompt to correctly formatted SQL query
4. ALWAYS wrap table names in double quotes: "allTrustControls" and "allTrustFaqs"
5. Return ONLY SQL query, nothing else

Now convert this: "${naturalLanguageQuery}"
`;

    const chatCompletion = await client.chatCompletion({
      model: "Qwen/Qwen2.5-Coder-3B-Instruct:nscale",
      messages: [
        {
          role: "user",
          content: systemPrompt,
        },
      ],
    });

    const sqlQuery = chatCompletion.choices[0].message.content?.trim();

    let cleanSql = sqlQuery?.replace(/```sql\s*/gi, "").replace(/```\s*/gi, "");

    const sqlMatch = cleanSql?.match(/SELECT.*?;/is); // Added 's' flag for multiline

    if (sqlMatch) {
      cleanSql = sqlMatch[0];
    }

    // Ensure table names are quoted
    cleanSql = cleanSql
      ?.replace(/FROM\s+allTrustControls/gi, 'FROM "allTrustControls"')
      .replace(/FROM\s+allTrustFaqs/gi, 'FROM "allTrustFaqs"')
      .replace(/JOIN\s+allTrustControls/gi, 'JOIN "allTrustControls"')
      .replace(/JOIN\s+allTrustFaqs/gi, 'JOIN "allTrustFaqs"');

    if (!cleanSql?.endsWith(";")) {
      cleanSql += ";";
    }

    res.locals.databaseQuery = cleanSql;
    return next();
  } catch (error) {
    return next(error);
  }
};
