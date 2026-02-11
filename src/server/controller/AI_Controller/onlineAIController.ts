import type { RequestHandler } from "express";
import type { ServerError } from "./types";
import "dotenv/config";
import { InferenceClient } from "@huggingface/inference";

const { AI_APIKEY } = process.env;

const hf = new InferenceClient(AI_APIKEY);

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
You are a SQL Convert natural language queries into valid PostgreSQL SELECT statements. 
Only respond with the SQL query, no explanations or markdown formatting.\n\nDatabase Schema:\n\nCREATE TABLE public.all_teams (\n  id UUID PRIMARY KEY,\n  first_name TEXT,\n  last_name TEXT,\n  role TEXT,\n  email TEXT,\n  is_active TEXT,\n  employee_id INTEGER,\n  response_time_hours NUMERIC,\n  categories TEXT,\n  search_text TEXT,\n
  created_at TIMESTAMP,\n  created_by TEXT,\n  updated_at TIMESTAMP,\n  updated_by TEXT\n);\n\nCREATE TABLE public.all_trust_controls (\n  id UUID PRIMARY KEY,\n  category TEXT,\n  short TEXT,\n  long TEXT,\n  search_text TEXT,\n  created_at TIMESTAMP,\n  created_by TEXT,\n  updated_at TIMESTAMP,\n  updated_by TEXT\n);
  \n\nCREATE TABLE public.all_trust_faqs (\n  id UUID PRIMARY KEY,\n  question TEXT,\n  answer TEXT,\n  categories TEXT,\n  search_text TEXT,\n  created_at TIMESTAMP,\n  created_by TEXT,\n  updated_at TIMESTAMP,\n  updated_by TEXT\n);
\n\nExamples:\nUser: 
"Get all active team members"\nQuery: SELECT * FROM public.all_teams WHERE is_active = 'true';\n\nUser: 
"Find FAQs about security"\nQuery: SELECT * FROM public.all_trust_faqs WHERE search_text ILIKE '%security%';\n\nUser: 
"Show controls in the compliance category"\nQuery: SELECT * FROM public.all_trust_controls WHERE category = 'compliance';

Instructions:
1. Carefully read user prompt
2. Identify keywords matching table properties in database
3. Convert prompt to correctly formatted SQL query
4. Return ONLY SQL query, nothing else

    Now convert this: "${naturalLanguageQuery}"
`;

    const chatCompletion = await hf.chatCompletion({
      model: "Qwen/Qwen2.5-Coder-3B-Instruct:nscale",
      messages: [
        {
          role: "user",
          content: systemPrompt,
        },
      ],
      max_token: 200,
      temperature: 0.1,
    });

    const sqlQuery = chatCompletion.choices[0].message.content?.trim();

    let cleanSql = sqlQuery?.replace(/```sql\s*/gi, "").replace(/```\s*/gi, "");

    const sqlMatch = cleanSql?.match(/SELECT.*?;/i);

    if (sqlMatch) {
      cleanSql = sqlMatch[0];
    }

    if (!cleanSql?.endsWith(";")) {
      cleanSql += ";";
    }

    res.locals.databaseQuery = cleanSql;
    return next();
  } catch (error) {
    return next(error);
  }
};
