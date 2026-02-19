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
    
    // Add category from WHERE clause if missing =====
    let rowsForJudgment = result.rows;
    
    // Check if this is a category-filtered query and results don't have category field
    if (databaseQuery.includes('category ILIKE') && result.rows.length > 0) {
      // Check if the first row is missing category field
      const firstRow = result.rows[0];
      if (!firstRow.hasOwnProperty('category')) {
        console.log('Category field missing from results - adding from WHERE clause');
        
        // Extract category from WHERE clause
        const categoryMatch = databaseQuery.match(/category ILIKE '([^']+)'/i);
        if (categoryMatch) {
          const category = categoryMatch[1];
          console.log(`Extracted category from query: "${category}"`);
          
          // Add category to every row for judgment AND frontend
          rowsForJudgment = result.rows.map(row => ({
            ...row,
            category: category
          }));
          
          console.log(`Added category field to ${rowsForJudgment.length} rows`);
        }
      }
    }
    
    // Use the same category-included results for both backend and frontend
    res.locals.databaseQueryResult = rowsForJudgment; // For judgment
    res.locals.databaseQueryError = null;
    
    if (res.locals.queryResult) { // For frontend
      res.locals.queryResult.results = rowsForJudgment; 
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