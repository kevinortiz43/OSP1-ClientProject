import { RequestHandler } from 'express';
import { ServerError } from '../types';
import { Pool } from 'pg';
import type { QueryResult } from 'pg';
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({connectionString: process.env.POSTGRES_URI});

export const queryStarWarsDatabase: RequestHandler = async (
  _req,
  res,
  next
) => {
  const { databaseQuery } = res.locals;
  
  if (!databaseQuery) {
    const error: ServerError = {
      log: 'Database query middleware did not receive a query',
      status: 500,
      message: { err: 'An error occurred before querying the database' },
    };
    return next(error);
  }

  try {

    const result: QueryResult = await pool.query(databaseQuery);
    

    res.locals.databaseQueryResult = result.rows;
    
    return next();
    
  } catch (error) {
    const serverError: ServerError = {
      log: `Database query error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 500,
      message: { err: 'Failed to execute database query' },
    };
    return next(serverError);
  }
};