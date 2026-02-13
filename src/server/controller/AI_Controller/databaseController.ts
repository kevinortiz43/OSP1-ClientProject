import type { RequestHandler } from "express";
import type { ServerError } from "./types";
import { Pool } from "pg";
import type { QueryResult } from "pg";
import { PG_URI } from "../../envVariables";

const pool = new Pool({
  connectionString: PG_URI,
});

const maxRetries = 3;
let attempt = 0;

export const databaseQuery: RequestHandler = async (_req, res, next) => {
  const { databaseQuery } = res.locals;

  if (!databaseQuery) {
    const error: ServerError = {
      log: "Database did not receive a query",
      status: 500,
      message: {
        err: "An error occurred before querying the database at databaseController.ts",
      },
    };
    return next(error);
  }

  while (attempt < maxRetries) {
    try {
      const result: QueryResult = await pool.query(databaseQuery);

      res.locals.sqlQuery = databaseQuery;
      res.locals.databaseQueryResult = result.rows;
      return next();
    } catch (error) {
      attempt++;

      if (attempt >= maxRetries) {
        res.locals.databaseQueryResult = [];
        res.locals.queryError =
          error instanceof Error ? error.message : "Unknown error";
        return next();
      }

      // exponential backoff with each failed datbaase query if the LLM fails to : 200ms, 400ms, 800ms
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 100),
      );
    }
  }
};
