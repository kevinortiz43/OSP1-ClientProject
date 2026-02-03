
// Open Router Api free

import { RequestHandler } from 'express';
import { ServerError } from '../types';
import dotenv from 'dotenv';

dotenv.config();

const schema =
  'You are a SQL expert. Convert natural language queries into valid PostgreSQL SELECT statements. Only respond with the SQL query, no explanations or markdown formatting.\n\nDatabase Schema:\n\nCREATE TABLE public.people (_id serial PRIMARY KEY, name varchar NOT NULL, mass varchar, hair_color varchar, skin_color varchar, eye_color varchar, birth_year varchar, gender varchar, species_id bigint, homeworld_id bigint, height integer);\n\nCREATE TABLE public.films (_id serial PRIMARY KEY, title varchar NOT NULL, episode_id integer NOT NULL, opening_crawl varchar NOT NULL, director varchar NOT NULL, producer varchar NOT NULL, release_date DATE NOT NULL);\n\nCREATE TABLE public.people_in_films (_id serial PRIMARY KEY, person_id bigint NOT NULL, film_id bigint NOT NULL);\n\nCREATE TABLE public.planets (_id serial PRIMARY KEY, name varchar, rotation_period integer, orbital_period integer, diameter integer, climate varchar, gravity varchar, terrain varchar, surface_water varchar, population bigint);\n\nCREATE TABLE public.species (_id serial PRIMARY KEY, name varchar NOT NULL, classification varchar, average_height varchar, average_lifespan varchar, hair_colors varchar, skin_colors varchar, eye_colors varchar, language varchar, homeworld_id bigint);\n\nCREATE TABLE public.vessels (_id serial PRIMARY KEY, name varchar NOT NULL, manufacturer varchar, model varchar, vessel_type varchar NOT NULL, vessel_class varchar NOT NULL, cost_in_credits bigint, length varchar, max_atmosphering_speed varchar, crew integer, passengers integer, cargo_capacity varchar, consumables varchar);\n\nCREATE TABLE public.species_in_films (_id serial PRIMARY KEY, film_id bigint NOT NULL, species_id bigint NOT NULL);\n\nCREATE TABLE public.planets_in_films (_id serial PRIMARY KEY, film_id bigint NOT NULL, planet_id bigint NOT NULL);\n\nCREATE TABLE public.pilots (_id serial PRIMARY KEY, person_id bigint NOT NULL, vessel_id bigint NOT NULL);\n\nCREATE TABLE public.vessels_in_films (_id serial PRIMARY KEY, vessel_id bigint NOT NULL, film_id bigint NOT NULL);\n\nCREATE TABLE public.starship_specs (_id serial PRIMARY KEY, hyperdrive_rating varchar, MGLT varchar, vessel_id bigint NOT NULL);';

const apiKey = process.env.OPENROUTER_API_KEY;
// const model = "nvidia/nemotron-3-nano-30b-a3b:free";
const model = 'xiaomi/mimo-v2-flash:free';
export const queryOpenAI: RequestHandler = async (_req, res, next) => {
  // res.locals.naturalLanguageQuery

  const { naturalLanguageQuery } = res.locals;

  if (!naturalLanguageQuery) {
    const error: ServerError = {
      log: 'OpenAI query middleware did not receive a query',
      status: 500,
      message: { err: 'An error occurred before querying OpenAI' },
    };
    return next(error);
  }

  try {
    // First API call with reasoning to convert natural language to SQL
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: schema,
            },
            {
              role: 'user',
              content: `Convert this natural language query to SQL: "${naturalLanguageQuery}"`,
            },
          ],
          reasoning: { enabled: true },
        }),
      }
    );

    const result = await response.json();

   
    if (!response.ok || result.error) {
      throw new Error(result.error?.message || 'OpenRouter API request failed');
    }

    const assistantMessage = result.choices[0].message;
    console.log('assistant message', assistantMessage);

    // Extract and clean the SQL query
    let sqlQuery = assistantMessage.content.trim();
    sqlQuery = sqlQuery
      .replace(/```sql\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // SELECT * from PEOPLE;

    // Store the generated SQL in res.locals.databaseQuery for the database controller
    res.locals.databaseQuery = sqlQuery;

    // Pass control to the next middleware (database controller)
    return next();
  } catch (error) {
    const serverError: ServerError = {
      log: `Error in queryOpenAI middleware: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 500,
      message: { err: 'Failed to generate SQL query from natural language' },
    };
    return next(serverError);
  }
};


///////////////////////////////////////////////////
// import { RequestHandler } from 'express';
// import { ServerError } from '../types';
// import dotenv from 'dotenv';
// import { OpenAI } from 'openai';

// dotenv.config();

// const apiKey = process.env.HF_TOKEN;

// export const queryOpenAI: RequestHandler = async (_req, res, next) => {
//   const { naturalLanguageQuery } = res.locals;

//   if (!naturalLanguageQuery) {
//     const error: ServerError = {
//       log: 'OpenAI query middleware did not receive a query',
//       status: 500,
//       message: { err: 'An error occurred before querying OpenAI' },
//     };
//     return next(error);
//   }

//   if (!apiKey) {
//     const error: ServerError = {
//       log: 'HF_TOKEN is not set in environment variables',
//       status: 500,
//       message: { err: 'Hugging Face API key configuration error' },
//     };
//     return next(error);
//   }

//   try {
//     const client = new OpenAI({
//       baseURL: 'https://router.huggingface.co/v1',
//       apiKey: apiKey,
//     });

//     const chatCompletion = await client.chat.completions.create({
//       model: 'openai/gpt-oss-20b:groq',
//       messages: [
//         {
//           role: 'system',
//           content:
//             'You are a SQL expert. Convert natural language queries into valid PostgreSQL SELECT statements. Only respond with the SQL query, no explanations or markdown formatting. The database has a table called "public.people" with columns like: name, eye_color, hair_color, height, mass, birth_year, gender, homeworld, species.',
//         },
//         {
//           role: 'user',
//           content: `Convert this natural language query to SQL: "${naturalLanguageQuery}"`,
//         },
//       ],
//     });

//     console.log('AI Response:', chatCompletion.choices[0].message);

//     const assistantMessage = chatCompletion.choices[0].message;

//     if (!assistantMessage.content) {
//       throw new Error('AI returned empty response');
//     }

//     let sqlQuery = assistantMessage.content.trim();
//     sqlQuery = sqlQuery
//       .replace(/```sql\n?/g, '')
//       .replace(/```\n?/g, '')
//       .trim();

//     console.log('Generated SQL Query:', sqlQuery);

//     if (!sqlQuery.toLowerCase().startsWith('select')) {
//       throw new Error('AI did not return a valid SELECT statement');
//     }

//     res.locals.databaseQuery = sqlQuery;

//     return next();
//   } catch (error) {
//     console.error('OpenAI Controller Error:', error);
//     const serverError: ServerError = {
//       log: `Error in queryOpenAI middleware: ${error instanceof Error ? error.message : 'Unknown error'}`,
//       status: 500,
//       message: { err: 'Failed to generate SQL query from natural language' },
//     };
//     return next(serverError);
//   }
// };
