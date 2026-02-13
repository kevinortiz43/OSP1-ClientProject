import { RequestHandler } from 'express';
import { ServerError } from '../types';
import { InferenceClient } from '@huggingface/inference';
import dotenv from 'dotenv';

dotenv.config(); // process.env

// npm install @huggingface/inference
// connect to AI model using hugging face token
const hf = new InferenceClient(process.env.HF_TOKEN);

export const queryOpenAI: RequestHandler = async (_req, res, next) => {
  try {
    const { naturalLanguageQuery } = res.locals;

    if (!naturalLanguageQuery) {
      const error: ServerError = {
        log: 'OpenAI query middleware did not receive a query',
        status: 500,
        message: { err: 'An error occurred before querying OpenAI' },
      };
      return next(error);
    }

    // TODO: Add your code here to call the OpenAI Responses API
    // Use the naturalLanguageQuery to generate a SQL query
    // Store the generated SQL in res.locals.databaseQuery

    // create prompt
    // persona pattern
    // few shot examples (but only provided 1 example to save on tokens)
    // added schema data for context
    const systemPrompt = `You are SQL expert. Convert user prompt to 1 SQL query for starwars database.

starwars database schema:
Main tables: people, films, planets, species, vessels, starship_specs, pilots
Join tables: people_in_films, species_in_films, planets_in_films, vessels_in_films

Instructions:
1. Carefully read user prompt
2. Identify keywords matching table properties in database
3. Convert prompt to correctly formatted SQL query
4. Return ONLY SQL query, nothing else

Example:
Prompt: "Name the person with white eyes"
SQL: SELECT name FROM public.people WHERE eye_color = 'white';

Now convert this: "${naturalLanguageQuery}" `;

// model: https://huggingface.co/RDson/CoderO1-DeepSeekR1-Coder-32B-Preview
// system role: 'who you are' (persona) + 'how to behave'
// user role: 'what you need to do' + 'examples' + 'actual task'

    const chatCompletion = await hf.chatCompletion({
      model: 'RDson/CoderO1-DeepSeekR1-Coder-32B-Preview:featherless-ai',
      messages: [
        // {
        //   role: 'system',
        //   content:
        //     'You are SQL expert.',
        // },
        {
          role: 'user',
          content: systemPrompt,
        },
      ],
      max_tokens: 200,
      temperature: 0.1, // low temp for more factual, precise SQL, higher temp would be more creative 
      // for image generation, lower temp adheres more to prompt, whereas higher temps will introduce more randomness, creativity, not necessarily strictly adhering to prompt
    });

    // extract SQL query resulting from text gen LLM
    const sqlQuery = chatCompletion.choices[0].message.content?.trim(); 

    // LLMs often return resp with code blocks (wrap code in ```sql...```)
    // LLMs might add explanations, i.e. 'Here's the SQL query:' before the SQL query
    // LLMs might give multiple queries
    // LLMs might add comments
    // LLMs would likely return whitespce -> tabs, line breaks, etc.
    // so we need to remove ALL of above to get ONLY SQL, no extras

    // clean SQL (get rid of markdown)
// regex:  /```sql -> match ```sql, case insens
// \s* = 0+ whitepace chars
// g - global
// i case insensitive

  // remove generic markdown code blocks (no language specified)
  // /```\s*/gi - Matches ``` followed by any whitespace
//  .replace(/```\s*/gi, '');

    let cleanSql = sqlQuery.replace(/```sql\s*/gi, '').replace(/```\s*/gi, '');

    // extract just SQL statement if extra text (i.e. comments, explanations, etc.)
    // match str SELECT to 1st semicolon, case insens
    // .*? any char (.) 0+ times (*), non-greedy (?) -> find pattern that matches as little text as possible, stops at 1st semicolon (rather than greedy will match as much text as possible that satisfies required pattern)
    const sqlMatch = cleanSql.match(/SELECT.*?;/i);
    if (sqlMatch) {
      cleanSql = sqlMatch[0];
    }

    // ensure cleanSql ends with semicolon
    if (!cleanSql.endsWith(';')) {
      cleanSql += ';';
    }

    console.log('Generated SQL:', cleanSql);

    // store generated SQL
    res.locals.databaseQuery = cleanSql;

    return next();
  } catch (error) {
    console.error('Error in queryOpenAI:', error);
    return next(error);
  }
};
