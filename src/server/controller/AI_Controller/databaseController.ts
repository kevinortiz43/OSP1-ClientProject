import { RequestHandler } from "express";
import { ServerError } from "./types";
import { Pool } from "pg";
import type { QueryResult } from "pg";
import "dotenv/config";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

export const databaseQuery: RequestHandler = async (_req, res, next) => {
  const { databaseQuery } = res.locals;

  if (!databaseQuery) {
    const error: ServerError = {
      log: "Database query did not receive a query",
      status: 500,
      message: { err: "An error occured before querying the database" },
    };
    return next(error);
  }
  try {
    const result: QueryResult = await pool.query(databaseQuery);

    res.locals.databaseQuery = result.rows;
    return next();
  } catch (error) {
    const serverError: ServerError = {
      log: `Database query error: ${error instanceof Error ? error.message : "Uknown error"}`,
      status: 500,
      message: { err: "Failed to execute database query" },
    };
    return next(serverError);
  }
};
