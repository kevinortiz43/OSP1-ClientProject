import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.PG_URI });

export default {
  getTrustControls: async (_, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM "allTrustControls"');

      if (!result) {
        res.locals.dbResults = "No trust controller controller data";
        return next();
      }
      res.locals.dbResults = result.rows;

      return next();
    } catch (error) {
      const serverError = {
        log: `Error in Trust Controller middleware: ${error instanceof Error ? error.message : "Unknown error"}`,
        status: 500,
        message: { err: "Failed to correctly retrieve the database  query for Trust Conrols" },
      };
      return next(serverError);
    }
  },
};
