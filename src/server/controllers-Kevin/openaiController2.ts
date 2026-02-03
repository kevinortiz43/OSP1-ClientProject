import { RequestHandler } from 'express';
import { ServerError } from '../types';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';

dotenv.config();

const apiKey = process.env.HF_TOKEN;

export const queryOpenAI: RequestHandler = async (_req, res, next) => {
  const { naturalLanguageQuery } = res.locals;

  if (!naturalLanguageQuery) {
    const error: ServerError = {
      log: 'OpenAI query middleware did not receive a query',
      status: 500,
      message: { err: 'An error occurred before querying OpenAI' },
    };
    return next(error);
  }

  // Check if API key exists
  if (!apiKey) {
    const error: ServerError = {
      log: 'HF_TOKEN is not set in environment variables',
      status: 500,
      message: { err: 'Hugging Face API key configuration error' },
    };
    return next(error);
  }

  try {
    const client = new OpenAI({
      baseURL: 'https://router.huggingface.co/v1',
      apiKey: apiKey,
    });

    const chatCompletion = await client.chat.completions.create({
      model: 'MiniMaxAI/MiniMax-M2.1:novita',
      messages: [
        {
          role: 'system',
          content: 'You are a SQL expert. Convert natural language queries into valid PostgreSQL SELECT statements. Only respond with the SQL query, no explanations or markdown formatting. The database has a table called "public.people" with columns like: name, eye_color, hair_color, height, mass, birth_year, gender, homeworld, species.'
        },
        {
          role: 'user',
          content: `Convert this natural language query to SQL: "${naturalLanguageQuery}"`,
        },
      ],
    });

    console.log('AI Response:', chatCompletion.choices[0].message);

    const assistantMessage = chatCompletion.choices[0].message;

    // Check if we got a valid response
    if (!assistantMessage.content) {
      throw new Error('AI returned empty response');
    }

    // Extract and clean the SQL query
    let sqlQuery = assistantMessage.content.trim();
    sqlQuery = sqlQuery
      .replace(/```sql\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    console.log('Generated SQL Query:', sqlQuery);

    // Validate that we got a SELECT statement
    if (!sqlQuery.toLowerCase().startsWith('select')) {
      throw new Error('AI did not return a valid SELECT statement');
    }

    // Store the generated SQL in res.locals.databaseQuery for the database controller
    res.locals.databaseQuery = sqlQuery;

    // Pass control to the next middleware (database controller)
    return next();
  } catch (error) {
    console.error('OpenAI Controller Error:', error);
    const serverError: ServerError = {
      log: `Error in queryOpenAI middleware: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 500,
      message: { err: 'Failed to generate SQL query from natural language' },
    };
    return next(serverError);
  }
};