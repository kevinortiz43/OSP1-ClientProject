import type { RequestHandler } from "express";
import type { ServerError } from "./types";
import { Pool } from "pg";
import type { QueryResult } from "pg";
import "dotenv/config";

const { PG_URI } = process.env;

const pool = new Pool({
  connectionString:
    "postgresql://postgres.kgdlviaqzszogrdtktma:cl13ntPr0j12345!@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
});

// Updated databaseQuery with retry logic
export const databaseQuery: RequestHandler = async (_req, res, next) => {
  const { databaseQuery } = res.locals;

  if (!databaseQuery) {
    const error: ServerError = {
      log: "Database query did not receive a query",
      status: 500,
      message: { err: "An error occurred before querying the database" },
    };
    return next(error);
  }

  
  // ADD THIS LOG TO SEE THE GENERATED SQL
  console.log("Generated SQL Query:", databaseQuery);

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const result: QueryResult = await pool.query(databaseQuery);

      // Store the raw SQL query and results separately
      res.locals.sqlQuery = databaseQuery;
      res.locals.databaseQueryResult = result.rows;
      return next();

    } catch (error) {
      attempt++;
      console.error(`Database query attempt ${attempt} failed:`, error);

      if (attempt >= maxRetries) {
        // After 3 failures, set empty results and continue
        res.locals.databaseQueryResult = [];
        res.locals.queryError = error instanceof Error ? error.message : "Unknown error";
        return next();
      }

      // Wait before retrying (exponential backoff: 200ms, 400ms, 800ms)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
    }
  }
};