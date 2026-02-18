import { type RequestHandler } from 'express';
import { createError } from "../errorHandler";
import db from '../sql_db/db_connect_agnostic';

export const executeDatabaseQuery: RequestHandler = async (_req, res, next) => {
// check if SQL databaseQuery exists (if not, then likely cache HIT from previous middleware)
  if (!res.locals.databaseQuery) {  
    // Still set empty results for consistency
    res.locals.databaseQueryResult = []; //  for backend, just make sure contains some value, even if empty array
    res.locals.databaseQueryError = null;
    return next(); // just continue, no error since no SQL query means cache might've HIT
  }

  // DB query (only if cache MISS) 
  const { databaseQuery } = res.locals;
  
  try {
    console.log('Executing SQL:', databaseQuery);
    const result = await db.query(databaseQuery);
    
    res.locals.databaseQueryResult = result.rows; //  for backend -> result used in judgment step in backgroundJobs.ts
    res.locals.databaseQueryError = null;
    
    if (res.locals.queryResult) { // for frontend -> sent to router.ts for response to frontend
      res.locals.queryResult.results = result.rows; 
    }
    
    return next();
    
  } catch (error) {   
    res.locals.databaseQueryResult = []; // make sure value is assigned, even if empty arr (since we need to be able to move onto judgment step)
    res.locals.databaseQueryError = error instanceof Error ? error.message : 'Unknown error occurred';
    
    if (res.locals.queryResult) {
      res.locals.queryResult.results = [];
      res.locals.queryResult.error = res.locals.databaseQueryError;
    }
    
    // Log the error but DON'T call next(createError) 
    // This would break the pipeline - we want judgment to still run
    console.error(createError(
      `databaseSQL query error: ${res.locals.databaseQueryError}`,
      500,
      'databaseController'
    ).log);
    
    // Continue to next middleware (judgment should still run)
    return next();
  }
};