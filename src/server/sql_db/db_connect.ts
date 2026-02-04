import { Pool } from 'pg';
import type { QueryResult } from "pg";
// import dotenv from "dotenv";
import 'dotenv/config'; 

// dotenv.config(); // process.env


// // create a new pool here using the connection string above
// const pool = new Pool({
//   // connectionString: process.env.PG_URI
//   connectionString: 'postgresql://postgres.kgdlviaqzszogrdtktma:cl13ntPr0j12345!@aws-0-us-west-2.pooler.supabase.com:6543/postgres'
// })



const pool = new Pool({
  host: process.env.DB_HOST ,
  port: Number(process.env.DB_PORT), 
  database: process.env.DB_NAME, 
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ,
});


pool.connect( (err, client, release) => {
  if (err) {

    console.error('Error connecting to offline database:', err.message);
  } else {
    console.log('Successfully connected to offline database');
    release(); 
  }
});


// We export an object that contains a property called query,
// which is a function that returns the invocation of pool.query() after logging the query
// This will be required in the controllers to be the access point to the database
export default {
  query: (text: string, params?: any[]): Promise<QueryResult<any>> => {
    console.log("executed query", text);
    return pool.query(text, params);
  },
};

export { pool }; 