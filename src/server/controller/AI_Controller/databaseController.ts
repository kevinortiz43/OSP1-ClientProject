import { Pool } from "pg";
import type { QueryResult } from "pg";
import { PG_URI } from "../../envVariables";

// const pool = new Pool({ connectionString: PG_URI });

const pool = new Pool({
  host: process.env.DB_HOST || "localhost", // 'db' inside Docker, 'localhost' outside
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "test_db",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "root",
});

const maxRetries = 3;

export async function databaseQuery(
  query: string,
): Promise<{ rows: any[]; error?: string }> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const result: QueryResult = await pool.query(query);
      return { rows: result.rows };
    } catch (error) {
      attempt++;

      if (attempt >= maxRetries) {
        return {
          rows: [],
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }

      // exponential backoff: 200ms, 400ms, 800ms
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 100),
      );
    }
  }

  return { rows: [], error: "Max retries reached" };
}
