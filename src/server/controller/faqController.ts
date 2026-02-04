import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST ,
  port: Number(process.env.DB_PORT), 
  database: process.env.DB_NAME, 
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ,
});

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
