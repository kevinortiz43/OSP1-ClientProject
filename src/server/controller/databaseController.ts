import { type RequestHandler } from 'express';
import { type ServerError } from '../types';
import db from '../sql_db/db_connect_agnostic';


export const executeDatabaseQuery: RequestHandler = async (_req, res, next) => {
  // Only execute if there's a SQL query (cache hit skips DB query)
  if (!res.locals.databaseQuery) {
    console.log('Skipping database query - no SQL to execute');
    
    // Still set empty results for consistency
    res.locals.databaseQueryResult = [];
    res.locals.databaseQueryError = null;
    return next();
  }

  // DB query (only if cache miss)
  const { databaseQuery } = res.locals;
  
  try {
    console.log('Executing SQL:', databaseQuery);
    const result = await db.query(databaseQuery);
    
    // Success path - set results and clear any previous error
    res.locals.databaseQueryResult = result.rows;
    res.locals.databaseQueryError = null;
    
    // Update queryResult with the results and ensure source is preserved
    if (res.locals.queryResult) {
      res.locals.queryResult.results = result.rows;
      console.log(`[DEBUG] After DB query - source is: ${res.locals.queryResult.source}`);
    }
    
    return next();
    
  } catch (error) {
    // ERROR PATH - Set empty results and capture error for judgment
    console.error('Database query error:', error);
    
    // ALWAYS set these, even on error
    res.locals.databaseQueryResult = [];  // Empty array so judgment can still run
    res.locals.databaseQueryError = error instanceof Error ? error.message : 'Unknown error';
    
    // Also update queryResult with empty results so API response still works
    if (res.locals.queryResult) {
      res.locals.queryResult.results = [];
      res.locals.queryResult.error = res.locals.databaseQueryError;
    }
    
    // Don't throw - continue to next middleware (judgment should still run)
    // The API will return empty results with an error field
    return next();
    
    // Commented out old error handling that stopped the pipeline:
    // const serverError: ServerError = {
    //   log: `Database query error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    //   status: 500,
    //   message: { err: 'Failed to execute database query' },
    // };
    // return next(serverError);
  }
};