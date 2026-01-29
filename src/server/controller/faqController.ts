import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.PG_URI });

export default {
  getTrustFaqs: async (_, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM "allTrustFaqs"');

      
      if (!result) {
        res.locals.dbResults = "No FAQ controller data";
      return next();
    }
      res.locals.dbResults = result.rows;


      return next();
    } catch (error) {
      console.log(`${error}`);
    }
  },
};
