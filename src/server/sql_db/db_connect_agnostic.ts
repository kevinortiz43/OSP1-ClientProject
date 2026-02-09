import { Pool } from 'pg';
import type { QueryResult } from "pg";

// Use OS-agnostic host resolution
const isRunningInDocker = process.env.RUNNING_IN_DOCKER === 'true' || 
                         process.env.DB_HOST === 'db' || 
                         process.env.DB_HOST === 'docker';
                         
const dockerPool = new Pool({
  host: process.env.DB_HOST || (isRunningInDocker ? 'db' : 'localhost'),  // 'db' when inside Docker, 'localhost' when outside
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'test_db',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
});

dockerPool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to Docker PostgreSQL:', err.message);
    console.error('Connection details:', {
      host: process.env.DB_HOST || (isRunningInDocker ? 'db' : 'localhost'),
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'test_db',
    });
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