import { type RequestHandler } from 'express';
import { type ServerError } from '../types';
import db from '../sql_db/db_connect_agnostic';


export const executeDatabaseQuery: RequestHandler = async (_req, res, next) => {
  // Only execute if there's a SQL query (cache hit skips DB query)
  if (!res.locals.databaseQuery) {
    console.log('Skipping database query - no SQL to execute');
    return next();
  }

  // DB query (only if cache miss)
  const { databaseQuery } = res.locals;
  
  try {
    console.log('Executing SQL:', databaseQuery);
    const result = await db.query(databaseQuery);
    
    res.locals.databaseQueryResult = result.rows;
    
    // Update queryResult with the results and ensure source is preserved
    if (res.locals.queryResult) {
      res.locals.queryResult.results = result.rows;
      // Make sure source is still "ai" (don't overwrite it)
      console.log(`[DEBUG] After DB query - source is: ${res.locals.queryResult.source}`);
    }
    
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