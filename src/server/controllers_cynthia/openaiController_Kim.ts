import { RequestHandler } from 'express';
import OpenAI from 'openai';
import { ServerError } from '../types';

/**
 * CONVERSATION STATE MANAGEMENT
 *
 * The Responses API's previous_response_id enables PROMPT CACHING:
 * - Reuses cached computation from previous API calls (cost + latency benefit)
 *
 * HOWEVER: previous_response_id does NOT automatically inject context into new requests.
 * To maintain conversation history, we must MANUALLY inject context into the prompt.
 *
 * Our approach (DEMO VERSION):
 * 1. Store the last database result in previousDatabaseResult (module-level variable)
 * 2. Inject it into the SYSTEM_PROMPT as <PREVIOUS_DATABASE_RESULT> tags
 * 3. The LLM uses this context to resolve pronouns like "that planet", "his homeworld"
 * 4. Pass previous_response_id to enable caching (cost/performance benefit)
 *
 * IMPORTANT for production: These module-level variables are shared across ALL requests.
 * In a real app, store per user/session (database, Redis, express-session) to prevent
 * one user's data from leaking into another's conversation.
 *
 * For this class demo, the module-level approach is fine since it's single-user.
 */
let previousResponseId: string | null = null;
let previousDatabaseResult: string | null = null;

// Export reset function to clear conversation state
export const resetConversationState = () => {
  previousResponseId = null;
  previousDatabaseResult = null;
};

// Export function to store database results for context
export const storeDatabaseResult = (result: string) => {
  previousDatabaseResult = result;
};

// Initialize OpenAI client using the Responses API
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DATABASE_SCHEMA = `###DATABASE SCHEMA###

Table: public.people
Columns: _id (serial, PK), name (varchar), mass (varchar), hair_color (varchar), skin_color (varchar), eye_color (varchar), birth_year (varchar), gender (varchar), species_id (bigint, FK), homeworld_id (bigint, FK), height (integer)

Table: public.films
Columns: _id (serial, PK), title (varchar), episode_id (integer), opening_crawl (varchar), director (varchar), producer (varchar), release_date (date)

Table: public.people_in_films
Columns: _id (serial, PK), person_id (bigint, FK), film_id (bigint, FK)

Table: public.planets
Columns: _id (serial, PK), name (varchar), rotation_period (integer), orbital_period (integer), diameter (integer), climate (varchar), gravity (varchar), terrain (varchar), surface_water (varchar), population (bigint)

Table: public.species
Columns: _id (serial, PK), name (varchar), classification (varchar), average_height (varchar), average_lifespan (varchar), hair_colors (varchar), skin_colors (varchar), eye_colors (varchar), language (varchar), homeworld_id (bigint, FK)

Table: public.vessels
Columns: _id (serial, PK), name (varchar), manufacturer (varchar), model (varchar), vessel_type (varchar), vessel_class (varchar), cost_in_credits (bigint), length (varchar), max_atmosphering_speed (varchar), crew (integer), passengers (integer), cargo_capacity (varchar), consumables (varchar)

Table: public.vessels_in_films
Columns: _id (serial, PK), vessel_id (bigint, FK), film_id (bigint, FK)

Table: public.pilots
Columns: _id (serial, PK), person_id (bigint, FK), vessel_id (bigint, FK)

Table: public.starship_specs
Columns: _id (serial, PK), hyperdrive_rating (varchar), MGLT (varchar), vessel_id (bigint, FK)

Table: public.species_in_films
Columns: _id (serial, PK), species_id (bigint, FK), film_id (bigint, FK)
`;

const INSTRUCTIONS = `###INSTRUCTIONS###

You must generate a single valid PostgreSQL SELECT query using ONLY the schema below.

HARD RULES (must always follow):
1) SELECT-only. No INSERT/UPDATE/DELETE/DROP/ALTER/etc.
2) Use ONLY tables/columns from the schema.
3) Always prefix tables with public. (e.g., public.people)
4) Exactly ONE semicolon, only at the very end of the query.

JOINING TABLES:
5) Use explicit JOIN syntax: JOIN table ON condition
   - Always use table aliases (p, s, f, etc.) for clarity
   - Every JOIN must have a clear ON condition using primary/foreign keys
   - For complex queries, build joins step-by-step: person → species → planet, then add more joins as needed

QUERY SHAPE:
6) If the user asks for ONE item (singular): include ORDER BY <unique id> ASC LIMIT 1
   - Do NOT use DISTINCT when using LIMIT 1 (unnecessary).
7) If the user asks for a LIST (plural): use SELECT DISTINCT to avoid duplicates.
   - Omit LIMIT unless the user explicitly asks for "top N".
   - When the same entity might appear multiple times (multiple films, multiple records), DISTINCT is required.

TEXT:
8) Use ILIKE for case-insensitive text matching.

CONVERSATION CONTEXT:
9) Pronoun resolution: if the user says "that planet / from there / his homeworld / it / those",
   substitute the ACTUAL value from <PREVIOUS_DATABASE_RESULT>. Never use pronoun words as literal values.

SUBQUERIES:
10) Avoid subqueries UNLESS filtering by a computed value (e.g., "the maximum height").
    - For finding related entities, use JOINs instead (more efficient, clearer intent).
    - If you must use a subquery, place it in WHERE clause with a simple condition.

SPECIAL CASES:
11) Droids: use (s.name ILIKE '%droid%' OR s.classification ILIKE '%droid%')
12) Vehicles/Starships: use public.vessels and join public.starship_specs by vessel_id when needed.
13) No occupation/role field exists: Identify roles by table relationships.
    - Pilots: People who exist in public.pilots table (JOIN to filter)
    - Species-defined roles: Join public.species, filter by name/classification
    - Film characters: Join public.people_in_films
    - Combined: Layer multiple JOINs to narrow by role + other attributes
`;

const EXAMPLES = `###EXAMPLES - FOCUS ON CORE PATTERNS###

PATTERN 1: Simple WHERE clause (single result)
Q: "Who has white eyes?"
SQL: SELECT p.name
FROM public.people p
WHERE p.eye_color = 'white'
ORDER BY p._id ASC
LIMIT 1;

PATTERN 2: Simple JOIN (single result)
Q: "What is Luke Skywalker's homeworld?"
SQL: SELECT pl.name
FROM public.people p
JOIN public.planets pl ON p.homeworld_id = pl._id
WHERE p.name = 'Luke Skywalker'
ORDER BY p._id ASC
LIMIT 1;

PATTERN 3: Multiple JOINs with DISTINCT (list result)
Q: "What films was Luke Skywalker in?"
SQL: SELECT DISTINCT f.title
FROM public.films f
JOIN public.people_in_films pf ON f._id = pf.film_id
JOIN public.people p ON p._id = pf.person_id
WHERE p.name = 'Luke Skywalker';

PATTERN 4: Context from previous result (pronoun resolution)
PREVIOUS ANSWER: "Tatooine" (from "What is Luke Skywalker's homeworld?")
Q: "Find all humans from that planet"
SQL: SELECT DISTINCT p.name
FROM public.people p
JOIN public.species s ON p.species_id = s._id
JOIN public.planets pl ON p.homeworld_id = pl._id
WHERE s.name = 'Human' AND pl.name = 'Tatooine';

NOTE: "that planet" = "Tatooine" from the previous result. Substitute the actual value!

PATTERN 5: Superlative (highest/lowest) with deterministic tie-breaker
Q: "What is the highest mass recorded for a person?"
SQL: SELECT p.name, p.mass
FROM public.people p
WHERE p.mass IS NOT NULL AND p.mass ~ '^[0-9]+(\\.[0-9]+)?$'
ORDER BY p.mass::numeric DESC, p._id ASC
LIMIT 1;

PATTERN 6: Complex multi-join finding a person by criteria across multiple related tables
Q: "Who is the Sullustan from Sullust that appears in films?"
SQL: SELECT DISTINCT p.name
FROM public.people p
JOIN public.species s ON p.species_id = s._id
JOIN public.planets pl ON s.homeworld_id = pl._id
JOIN public.people_in_films pf ON p._id = pf.person_id
WHERE s.name ILIKE 'Sullustan' AND pl.name = 'Sullust'
ORDER BY p._id ASC
LIMIT 1;

CRITICAL for multi-join queries:
- Use JOIN to connect tables, not complex subqueries
- Filter by all criteria in the WHERE clause
- Use DISTINCT when the same person might appear multiple times (due to multiple films/roles)
- Order by the primary key (_id) to ensure deterministic results
- Only add LIMIT 1 if asking for a single result

PATTERN 7: Selecting a container filtered by its contents
When the question asks for an entity (planet/film/species) that contains or is related to specific people/data:

Example: "Find the planet with the longest days where a pilot is from"
- SELECT: pl.name (PLANET - what we want to return)
- JOINs: people → pilots (to establish who qualifies)
- WHERE: pl.climate ILIKE '%arid%' (filters the PLANETS by their attributes)
- ORDER BY: pl.rotation_period DESC, pl._id ASC (orders PLANETS by their superlative)
- LIMIT 1: ensures one result

Key principle: The entities you JOIN through (people, pilots) are filters. The SELECT table is the result.

Build this step-by-step:
1. Identify the entity type you're returning (planets, films, species, etc.)
2. Add JOINs through related tables to establish filtering criteria
3. WHERE filters apply to the main entity's attributes
4. ORDER BY orders the main entity by its own superlative
5. Use deterministic tie-breaker (_id ASC)
6. Use LIMIT 1 for singular results

This is more general than Pattern 6: ANY container filtered by ANY contained relationship.
`;

/**
 * SYSTEM PROMPT ARCHITECTURE
 *
 * This prompt follows best practices for structured prompting:
 * 1. ROLE: Sets the LLM's persona and primary objective
 * 2. CONTEXT: Provides schema and examples (few-shot learning)
 * 3. INSTRUCTIONS: Lists explicit constraints and rules
 * 4. TASK: Clear directive for what to generate
 */
const SYSTEM_PROMPT = `***ROLE***
You are an expert SQL Query Generator specialized in a Star Wars PostgreSQL schema. Your job is to translate user questions into valid, safe PostgreSQL SELECT queries.

***CONTEXT***
<SCHEMA>
${DATABASE_SCHEMA}
</SCHEMA>
<EXAMPLES>
${EXAMPLES}
</EXAMPLES>

***RULES***
${INSTRUCTIONS}

***TASK***
Analyze the provided question and generate:
1) the SQL query (string)
2) a brief English explanation (max 280 chars)
The query must strictly follow the rules above.`;

/**
 * DEMO SAFETY GATE (Deterministic Validation)
 *
 * This is NOT a full SQL parser. It's a simple, teachable "seatbelt":
 * - must be SELECT
 * - must end with one semicolon
 * - must not contain obvious destructive keywords
 *
 * For production, use a real SQL parser + DB role permissions.
 */
const deterministicSqlGate = (sql: string) => {
  const s = sql.trim();

  // Must end with exactly one semicolon
  const semicolons = (s.match(/;/g) || []).length;
  if (semicolons !== 1 || !s.endsWith(';')) {
    return { ok: false, reason: 'Query must contain exactly one semicolon at the very end.' };
  }

  // Must start with SELECT
  if (!/^\s*select\b/i.test(s)) {
    return { ok: false, reason: 'Only SELECT queries are allowed.' };
  }

  // Block obvious dangerous keywords
  const forbidden = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b/i;
  if (forbidden.test(s)) {
    return { ok: false, reason: 'Query contains a forbidden keyword (non-SELECT operation).' };
  }

  return { ok: true as const, reason: '' };
};

/**
 * LLM AS A JUDGE PATTERN
 *
 * Flow: Generator (1st attempt) → Deterministic Gate → Judge LLM → [if invalid] → Corrector (2nd attempt) → Gate → Execute
 *
 * Why both Gate + Judge?
 * - Gate catches obvious unsafe patterns reliably
 * - Judge checks "does it actually answer the question?" + schema/rule adherence
 */
const JUDGE_PROMPT_TEMPLATE = (
  naturalLanguageQuery: string,
  databaseQuery: string,
  previousResult?: string | null
) => {
  return `***ROLE***
You are a strict but fair SQL reviewer for a learning demo. You check whether a generated SQL query follows the rules and matches the user's question.

***SCHEMA***
${DATABASE_SCHEMA}

***RULES***
${INSTRUCTIONS}

***INPUTS***
${previousResult ? `<PREVIOUS_DATABASE_RESULT>\n${previousResult}\n</PREVIOUS_DATABASE_RESULT>\n` : ''}

<QUESTION>
${naturalLanguageQuery}
</QUESTION>

<GENERATED_QUERY>
${databaseQuery}
</GENERATED_QUERY>

***TASK***
Return JSON with:
- verdict: "pass" or "fail"
- errors: string[] (only real problems)
- warnings: string[] (style improvements)

Checks to apply (in order):
1) Does it answer the QUESTION?
2) Singular vs List rule:
   - If singular, require ORDER BY ... LIMIT 1, and do not use DISTINCT.
   - If list/plural, require DISTINCT, and avoid LIMIT unless the question asks for a cap.
3) Pronoun resolution:
   - If QUESTION includes pronouns or phrases like "that planet/from there/his homeworld",
     the SQL must use the concrete value from <PREVIOUS_DATABASE_RESULT>, not pronoun words.
4) Schema usage:
   - Only use tables/columns from the schema.
   - Tables must be prefixed with public.
5) Syntax:
   - Exactly one semicolon at the end.

Important:
- Put ONLY real failures in errors.
- If there are errors, verdict must be "fail".
- Keep warnings short.

Output JSON only.`;
};

/**
 * Creates the Correction Prompt, feeding the previous critique back to the Generator LLM.
 */
const CORRECTOR_PROMPT_TEMPLATE = (
  naturalLanguageQuery: string,
  previousQuery: string,
  critique: string,
  previousResult?: string | null
) => {
  return `***ROLE***
You are an expert SQL Query Generator specialized in a Star Wars PostgreSQL schema. Your job is to translate user questions into valid, safe PostgreSQL SELECT queries.

***CONTEXT***
<SCHEMA>
${DATABASE_SCHEMA}
</SCHEMA>
<EXAMPLES>
${EXAMPLES}
</EXAMPLES>

***RULES***
${INSTRUCTIONS}

${previousResult ? `<PREVIOUS_DATABASE_RESULT>\n${previousResult}\n</PREVIOUS_DATABASE_RESULT>\n` : ''}

***PREVIOUS ATTEMPT & CRITIQUE***
Your last attempt was judged as INVALID due to:
<CRITIQUE_REASON>
${critique}
</CRITIQUE_REASON>
<FAILED_QUERY>
${previousQuery}
</FAILED_QUERY>

***TASK***
Generate a corrected SQL query and a brief English explanation (max 280 chars).
The query must directly address the critique and follow all rules.

<CURRENT_QUESTION>
${naturalLanguageQuery}
</CURRENT_QUESTION>`;
};

/**
 * GENERATOR LLM - Initial SQL Generation (1st Attempt)
 */
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

  try {
    console.log('\n📝 [STEP 1] GENERATOR LLM - Creating SQL from user question...');
    console.log(`   User asked: "${naturalLanguageQuery}"`);

    // Build input with optional previous database result for pronoun resolution
    let input = SYSTEM_PROMPT;

    if (previousDatabaseResult) {
      input += `\n\n<PREVIOUS_DATABASE_RESULT>\n${previousDatabaseResult}\n</PREVIOUS_DATABASE_RESULT>`;
    }

    input += `\n\n<CURRENT_QUESTION>\n${naturalLanguageQuery}\n</CURRENT_QUESTION>`;

    const response = await openai.responses.create({
      model: 'gpt-4o',
      temperature: 0.1,
      max_output_tokens: 500,
      input,
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
      text: {
        format: {
          type: 'json_schema',
          name: 'sql_query',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              explanation: { type: 'string', maxLength: 280 },
            },
            required: ['query', 'explanation'],
            additionalProperties: false,
          },
        },
      },
    });

    // Store the response ID for prompt caching
    previousResponseId = response.id;

    console.log('Generator LLM - Token usage:', response.usage);

    let parsed: { query: string; explanation: string };
    try {
      parsed = JSON.parse(response.output_text);
    } catch {
      throw new Error('Model returned invalid JSON; check schema or prompt.');
    }

    console.log('   ✅ Generated SQL Explanation:', parsed.explanation);
    console.log('   SQL Query (1st attempt):', parsed.query);

    res.locals.databaseQuery = parsed.query;
    res.locals.queryAttempt = 1;

    return next();
  } catch (error) {
    const err: ServerError = {
      log: `Error in queryOpenAI (Generator): ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 500,
      message: { err: 'An error occurred while generating SQL query' },
    };
    return next(err);
  }
};

/**
 * JUDGE LLM - SQL Validation
 *
 * Step order:
 * 1) Deterministic Gate (fast "seatbelt")
 * 2) LLM Judge (semantic correctness + rule adherence)
 */
export const validateWithLLMJudge: RequestHandler = async (_req, res, next) => {
  const { naturalLanguageQuery, databaseQuery } = res.locals;

  if (!databaseQuery) return next();

  // deterministic validation gate
  const gate = deterministicSqlGate(databaseQuery);
  if (!gate.ok) {
    res.locals.validation = false;
    res.locals.violationReason = gate.reason;

    console.log('   ❌ [STEP 2] DETERMINISTIC GATE - SQL is INVALID');
    console.log(`   📋 Reason: ${gate.reason}`);
    console.log('   🔧 Moving to CORRECTOR for 2nd attempt...');

    return next();
  }

  try {
    // LLM judge (has previous result context so it can grade pronoun resolution)
    const input = JUDGE_PROMPT_TEMPLATE(
      naturalLanguageQuery!,
      databaseQuery,
      previousDatabaseResult
    );

    const response = await openai.responses.create({
      model: 'gpt-4o',
      temperature: 0.1,
      max_output_tokens: 500,
      input,
      text: {
        format: {
          type: 'json_schema',
          name: 'judgement',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              verdict: { type: 'string', enum: ['pass', 'fail'] },
              errors: { type: 'array', items: { type: 'string' } },
              warnings: { type: 'array', items: { type: 'string' } },
            },
            required: ['verdict', 'errors', 'warnings'],
            additionalProperties: false,
          },
        },
      },
    });

    console.log('Judge LLM - Token usage:', response.usage);

    let parsed: { verdict: 'pass' | 'fail'; errors: string[]; warnings: string[] };
    try {
      parsed = JSON.parse(response.output_text);
    } catch {
      parsed = { verdict: 'fail', errors: ['Judge returned invalid JSON.'], warnings: [] };
    }

    const isValid = parsed.verdict === 'pass' && parsed.errors.length === 0;

    res.locals.validation = isValid;
    res.locals.violationReason = isValid ? '' : parsed.errors.join(' | ');
    res.locals.judgeWarnings = parsed.warnings;

    if (isValid) {
      console.log('   ✅ [STEP 2] JUDGE LLM - SQL is VALID! ✨');
      if (parsed.warnings.length) {
        console.log('   ⚠️  Warnings:', parsed.warnings);
      }
    } else {
      console.log('   ⚠️  [STEP 2] JUDGE LLM - SQL is INVALID');
      console.log(`   📋 Errors: ${parsed.errors.join(' | ')}`);
      if (parsed.warnings.length) console.log('   ⚠️  Warnings:', parsed.warnings);
      console.log('   🔧 Moving to CORRECTOR for 2nd attempt...');
    }

    return next();
  } catch (error) {
    const err: ServerError = {
      log: `Error in validateWithLLMJudge (Judge): ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 500,
      message: { err: 'An error occurred while judging SQL query' },
    };
    return next(err);
  }
};

/**
 * CORRECTOR LLM - Self-Correction Loop (2nd Attempt)
 *
 * If invalid, generate a corrected SQL query based on the judge critique.
 * For demo clarity, we do:
 * - one correction attempt max
 * - re-run deterministic gate after correction
 *
 * (In production, you might re-run the LLM judge too.)
 */
export const correctSQLQuery: RequestHandler = async (_req, res, next) => {
  const { naturalLanguageQuery, databaseQuery, validation, violationReason, queryAttempt } = res.locals;

  if (validation === true) {
    console.log('   [STEP 3] CORRECTOR - Skipping (SQL already valid)');
    return next();
  }

  if (queryAttempt && queryAttempt > 1) {
    console.warn('   ⚠️  [STEP 3] CORRECTOR - Max attempts reached. Keeping current query.');
    return next();
  }

  console.log('   [STEP 3] CORRECTOR LLM - Fixing the invalid SQL...');

  try {
    const input = CORRECTOR_PROMPT_TEMPLATE(
      naturalLanguageQuery!,
      databaseQuery!,
      violationReason || 'Unknown validation failure.',
      previousDatabaseResult
    );

    const response = await openai.responses.create({
      model: 'gpt-4o',
      temperature: 0.1,
      max_output_tokens: 500,
      input,
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
      text: {
        format: {
          type: 'json_schema',
          name: 'sql_query',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              explanation: { type: 'string', maxLength: 280 },
            },
            required: ['query', 'explanation'],
            additionalProperties: false,
          },
        },
      },
    });

    previousResponseId = response.id;

    console.log('Corrector LLM - Token usage:', response.usage);

    let parsed: { query: string; explanation: string };
    try {
      parsed = JSON.parse(response.output_text);
    } catch {
      throw new Error('Corrector returned invalid JSON; keeping previous query.');
    }

    console.log('   ✅ Corrected SQL Explanation:', parsed.explanation);
    console.log('   SQL Query (2nd attempt):', parsed.query);

    // Overwrite query with corrected version
    res.locals.databaseQuery = parsed.query;
    res.locals.queryAttempt = (res.locals.queryAttempt || 1) + 1;

    // Re-run deterministic gate after correction (minimum safety)
    const gate = deterministicSqlGate(parsed.query);
    if (!gate.ok) {
      console.warn(`   ❌ Corrected query still fails deterministic gate: ${gate.reason}`);
      res.locals.validation = false;
      res.locals.violationReason = gate.reason;
    } else {
      // For demo simplicity: if gate passes, allow execution.
      // (Optionally you could re-run validateWithLLMJudge here too.)
      res.locals.validation = true;
      res.locals.violationReason = '';
    }

    return next();
  } catch (error) {
    const err: ServerError = {
      log: `Error in correctSQLQuery (Corrector): ${error instanceof Error ? error.message : 'Unknown error'}. Proceeding with existing query.`,
      status: 500,
      message: { err: 'Correction attempt failed.' },
    };
    console.error(err.log);
    return next();
  }
};