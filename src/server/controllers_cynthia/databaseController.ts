import { RequestHandler } from 'express';
import { ServerError } from '../types';
import { Pool, QueryResult } from "pg";
import dotenv from "dotenv";

dotenv.config(); // process.env

// create a new pool here using the connection string above
const pool = new Pool({
  connectionString: process.env.PG_URI
})


pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to Supabase:', err.message);
  } else {
    console.log('Successfully connected to Supabase');
    release(); // Release the client back to the pool
  }
});

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

  // TODO: Add your code here to execute the SQL query against your Supabase database
  // Use the databaseQuery from res.locals to query the database
  try {
    
    const result: QueryResult = await pool.query(databaseQuery);

 // Store the results in res.locals.databaseQueryResult
  // res.locals.databaseQueryResult = [{ name: 'Sly Moore' }]

  res.locals.databaseQueryResult = result.rows;


  return next();
} catch (err) {
  return next(err); 
}

}

