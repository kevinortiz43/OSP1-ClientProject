import { createError } from '../errorHandler';
import db from '../sql_db/db_connect_agnostic';
import { type DatabaseQueryOutput } from '../types';

const MAX_RETRIES = 3;

export async function databaseQuery(sql: string): Promise<DatabaseQueryOutput> {
  // No SQL means cache HIT upstream — return empty rows, not an error
  if (!sql) {
    return { rows: [] };
  }

  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      console.log('Executing SQL:', sql);
      const result = await db.query(sql);
      let rows = result.rows;

      // Add category from WHERE clause if missing from results
      if (sql.includes('category ILIKE') && rows.length > 0) {
        const firstRow = rows[0];

        if (!Object.prototype.hasOwnProperty.call(firstRow, 'category')) {
          console.log('Category field missing from results - adding from WHERE clause');

          const categoryMatch = sql.match(/category ILIKE '([^']+)'/i);
          if (categoryMatch) {
            const category = categoryMatch[1];
            console.log(`Extracted category from query: "${category}"`);
            rows = rows.map(row => ({ ...row, category }));
            console.log(`Added category field to ${rows.length} rows`);
          }
        }
      }

      return { rows };

    } catch (error) {
      attempt++;

      if (attempt >= MAX_RETRIES) {
        // Log but don't throw — judgment step should still run even on DB error
        console.error(createError(
          `databaseSQL query error after ${MAX_RETRIES} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`,
          500,
          'databaseController'
        ).log);

        return {
          rows: [],
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }

      // Exponential backoff: 200ms, 400ms, 800ms
      const delay = Math.pow(2, attempt) * 100;
      console.warn(`DB query attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { rows: [], error: 'Max retries reached' };
}