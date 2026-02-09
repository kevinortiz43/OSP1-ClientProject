import { Pool } from 'pg';
import type { QueryResult } from "pg";

// docker PostgreSQL connection
const dockerPool = new Pool({
  host: process.env.DB_HOST || 'localhost',  // 'db' when inside Docker, 'localhost' when outside
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'test_db',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
});

dockerPool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to Docker PostgreSQL:', err.message);
  } else {
    console.log('Successfully connected to Docker PostgreSQL');
    release();
  }
});

export default {
  query: (text: string, params?: any[]): Promise<QueryResult<any>> => {
    console.log("executed query", text);
    return dockerPool.query(text, params);
  },
};

export { dockerPool };