import { type RequestHandler } from 'express';
import { createError } from "../errorHandler";
import db from '../sql_db/db_connect_agnostic';

export const executeDatabaseQuery: RequestHandler = async (_req, res, next) => {
  // Only execute if there's a SQL query (cache hit skips DB query)
  if (!res.locals.databaseQuery) {  
    // Still set empty results for consistency
    res.locals.databaseQueryResult = [];
    res.locals.databaseQueryError = null;
    // Just continue normally (this sin't an error since cache HIT)
    return next(); // Just continue, don't create error
  }

  // DB query (only if cache miss)
  const { databaseQuery } = res.locals;
  
  try {
    console.log('Executing SQL:', databaseQuery);
    const result = await db.query(databaseQuery);
    
    res.locals.databaseQueryResult = result.rows;
    res.locals.databaseQueryError = null;
    
    if (res.locals.queryResult) {
      res.locals.queryResult.results = result.rows;
    }
    
    return next();
    
  } catch (error) {   
    res.locals.databaseQueryResult = [];
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