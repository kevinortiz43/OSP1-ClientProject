import { Pool } from 'pg';
import type { QueryResult } from "pg";

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

// Adding some notes about the database here will be helpful for future you or other developers.
// Schema for the database can be found below:
// https://github.com/CodesmithLLC/unit-10SB-databases/blob/master/docs/assets/images/schema.png

// We export an object that contains a property called query,
// which is a function that returns the invocation of pool.query() after logging the query
// This will be required in the controllers to be the access point to the database
export default {
  query: (text: string, params?: any[]): Promise<QueryResult<any>> => {
    console.log("executed query", text);
    return pool.query(text, params);
  },
};
